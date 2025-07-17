import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { getAuroraClient } from '../utils/aurora-client';
import { logger } from '../utils/logger';
import { getSecretValue } from '../utils/secrets-manager';

export interface PaymentIntent {
  id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: string;
  stripe_payment_intent_id?: string;
  stripe_client_secret?: string;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  patient_id: string;
  type: string;
  stripe_payment_method_id?: string;
  last4?: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
}

export class PaymentService {
  private stripe: Stripe | null = null;
  private auroraClient = getAuroraClient();
  
  async getStripeClient(): Promise<Stripe> {
    if (!this.stripe) {
      const stripeSecretKey = await getSecretValue('stripe-secret-key');
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2023-10-16',
      });
    }
    return this.stripe;
  }

  async createPaymentIntent(
    bookingId: string,
    amount: number,
    currency: string = 'jpy',
    paymentMethodId?: string
  ): Promise<PaymentIntent> {
    const stripe = await this.getStripeClient();
    const paymentIntentId = uuidv4();

    try {
      // Get booking details
      const bookingResult = await this.auroraClient.query(
        `SELECT b.*, p.email, p.name as patient_name, p.stripe_customer_id
         FROM bookings b
         JOIN patients p ON b.patient_id = p.id
         WHERE b.id = $1`,
        [bookingId]
      );

      if (bookingResult.records.length === 0) {
        throw new Error('Booking not found');
      }

      const booking = bookingResult.records[0];

      // Create or get Stripe customer
      let stripeCustomerId = booking.stripe_customer_id;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: booking.email,
          name: booking.patient_name,
          metadata: {
            patient_id: booking.patient_id,
          },
        });
        stripeCustomerId = customer.id;

        // Update patient with Stripe customer ID
        await this.auroraClient.query(
          'UPDATE patients SET stripe_customer_id = $1 WHERE id = $2',
          [stripeCustomerId, booking.patient_id]
        );
      }

      // Create Stripe payment intent
      const paymentIntentData: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(amount), // Stripe expects amount in smallest currency unit
        currency,
        customer: stripeCustomerId,
        metadata: {
          booking_id: bookingId,
          payment_intent_id: paymentIntentId,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      };

      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
      }

      const stripePaymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      // Store payment intent in database
      const result = await this.auroraClient.query(
        `INSERT INTO payment_intents (
          id, booking_id, amount, currency, status,
          stripe_payment_intent_id, stripe_client_secret, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          paymentIntentId,
          bookingId,
          amount,
          currency,
          'pending',
          stripePaymentIntent.id,
          stripePaymentIntent.client_secret,
          new Date().toISOString(),
        ]
      );

      logger.info('Payment intent created', {
        paymentIntentId,
        bookingId,
        amount,
        stripePaymentIntentId: stripePaymentIntent.id,
      });

      return result.records[0];
    } catch (error) {
      logger.error('Failed to create payment intent', { error, bookingId, amount });
      throw error;
    }
  }

  async confirmPayment(paymentIntentId: string): Promise<PaymentIntent> {
    const stripe = await this.getStripeClient();

    try {
      // Get payment intent from database
      const result = await this.auroraClient.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [paymentIntentId]
      );

      if (result.records.length === 0) {
        throw new Error('Payment intent not found');
      }

      const paymentIntent = result.records[0];

      // Confirm with Stripe
      const stripePaymentIntent = await stripe.paymentIntents.confirm(
        paymentIntent.stripe_payment_intent_id
      );

      // Update status in database
      const updatedResult = await this.auroraClient.query(
        `UPDATE payment_intents 
         SET status = $1, updated_at = $2
         WHERE id = $3
         RETURNING *`,
        [stripePaymentIntent.status, new Date().toISOString(), paymentIntentId]
      );

      // If payment succeeded, update booking status
      if (stripePaymentIntent.status === 'succeeded') {
        await this.auroraClient.query(
          `UPDATE bookings 
           SET payment_status = 'paid', status = 'confirmed', updated_at = $1
           WHERE id = $2`,
          [new Date().toISOString(), paymentIntent.booking_id]
        );
      }

      return updatedResult.records[0];
    } catch (error) {
      logger.error('Failed to confirm payment', { error, paymentIntentId });
      throw error;
    }
  }

  async cancelPayment(paymentIntentId: string): Promise<PaymentIntent> {
    const stripe = await this.getStripeClient();

    try {
      // Get payment intent from database
      const result = await this.auroraClient.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [paymentIntentId]
      );

      if (result.records.length === 0) {
        throw new Error('Payment intent not found');
      }

      const paymentIntent = result.records[0];

      // Cancel with Stripe
      await stripe.paymentIntents.cancel(paymentIntent.stripe_payment_intent_id);

      // Update status in database
      const updatedResult = await this.auroraClient.query(
        `UPDATE payment_intents 
         SET status = 'cancelled', updated_at = $1
         WHERE id = $2
         RETURNING *`,
        ['cancelled', new Date().toISOString(), paymentIntentId]
      );

      return updatedResult.records[0];
    } catch (error) {
      logger.error('Failed to cancel payment', { error, paymentIntentId });
      throw error;
    }
  }

  async savePaymentMethod(
    patientId: string,
    stripePaymentMethodId: string,
    setAsDefault: boolean = false
  ): Promise<PaymentMethod> {
    const stripe = await this.getStripeClient();

    try {
      // Get payment method details from Stripe
      const stripePaymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

      // Get patient's Stripe customer ID
      const patientResult = await this.auroraClient.query(
        'SELECT stripe_customer_id FROM patients WHERE id = $1',
        [patientId]
      );

      if (patientResult.records.length === 0) {
        throw new Error('Patient not found');
      }

      const stripeCustomerId = patientResult.records[0].stripe_customer_id;

      // Attach payment method to customer
      await stripe.paymentMethods.attach(stripePaymentMethodId, {
        customer: stripeCustomerId,
      });

      // If setting as default, update Stripe customer
      if (setAsDefault) {
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: stripePaymentMethodId,
          },
        });

        // Update other payment methods to not be default
        await this.auroraClient.query(
          'UPDATE payment_methods SET is_default = false WHERE patient_id = $1',
          [patientId]
        );
      }

      // Save payment method to database
      const paymentMethodId = uuidv4();
      const result = await this.auroraClient.query(
        `INSERT INTO payment_methods (
          id, patient_id, type, stripe_payment_method_id,
          last4, brand, exp_month, exp_year,
          is_default, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          paymentMethodId,
          patientId,
          stripePaymentMethod.type,
          stripePaymentMethodId,
          stripePaymentMethod.card?.last4,
          stripePaymentMethod.card?.brand,
          stripePaymentMethod.card?.exp_month,
          stripePaymentMethod.card?.exp_year,
          setAsDefault,
          true,
          new Date().toISOString(),
        ]
      );

      logger.info('Payment method saved', {
        paymentMethodId,
        patientId,
        type: stripePaymentMethod.type,
      });

      return result.records[0];
    } catch (error) {
      logger.error('Failed to save payment method', { error, patientId, stripePaymentMethodId });
      throw error;
    }
  }

  async listPaymentMethods(patientId: string): Promise<PaymentMethod[]> {
    const result = await this.auroraClient.query(
      `SELECT * FROM payment_methods 
       WHERE patient_id = $1 AND is_active = true
       ORDER BY is_default DESC, created_at DESC`,
      [patientId]
    );

    return result.records;
  }

  async deletePaymentMethod(paymentMethodId: string, patientId: string): Promise<void> {
    const stripe = await this.getStripeClient();

    try {
      // Get payment method
      const result = await this.auroraClient.query(
        'SELECT * FROM payment_methods WHERE id = $1 AND patient_id = $2',
        [paymentMethodId, patientId]
      );

      if (result.records.length === 0) {
        throw new Error('Payment method not found');
      }

      const paymentMethod = result.records[0];

      // Detach from Stripe
      if (paymentMethod.stripe_payment_method_id) {
        await stripe.paymentMethods.detach(paymentMethod.stripe_payment_method_id);
      }

      // Soft delete in database
      await this.auroraClient.query(
        'UPDATE payment_methods SET is_active = false, updated_at = $1 WHERE id = $2',
        [new Date().toISOString(), paymentMethodId]
      );

      logger.info('Payment method deleted', { paymentMethodId, patientId });
    } catch (error) {
      logger.error('Failed to delete payment method', { error, paymentMethodId, patientId });
      throw error;
    }
  }

  async processRefund(
    bookingId: string,
    amount?: number,
    reason?: string
  ): Promise<any> {
    const stripe = await this.getStripeClient();

    try {
      // Get successful payment for booking
      const paymentResult = await this.auroraClient.query(
        `SELECT * FROM payment_intents 
         WHERE booking_id = $1 AND status = 'succeeded'
         ORDER BY created_at DESC LIMIT 1`,
        [bookingId]
      );

      if (paymentResult.records.length === 0) {
        throw new Error('No successful payment found for booking');
      }

      const payment = paymentResult.records[0];

      // Create refund with Stripe
      const refundData: Stripe.RefundCreateParams = {
        payment_intent: payment.stripe_payment_intent_id,
        reason: reason === 'cancellation' ? 'requested_by_customer' : 'duplicate',
      };

      if (amount) {
        refundData.amount = Math.round(amount);
      }

      const stripeRefund = await stripe.refunds.create(refundData);

      // Store refund in database
      const refundId = uuidv4();
      await this.auroraClient.query(
        `INSERT INTO refunds (
          id, booking_id, payment_intent_id, amount,
          reason, stripe_refund_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          refundId,
          bookingId,
          payment.id,
          stripeRefund.amount,
          reason || 'cancellation',
          stripeRefund.id,
          stripeRefund.status,
          new Date().toISOString(),
        ]
      );

      logger.info('Refund processed', {
        refundId,
        bookingId,
        amount: stripeRefund.amount,
        status: stripeRefund.status,
      });

      return {
        id: refundId,
        amount: stripeRefund.amount,
        status: stripeRefund.status,
        reason: reason || 'cancellation',
      };
    } catch (error) {
      logger.error('Failed to process refund', { error, bookingId, amount });
      throw error;
    }
  }

  async handleStripeWebhook(event: any): Promise<void> {
    const stripe = await this.getStripeClient();
    const endpointSecret = await getSecretValue('stripe-webhook-secret');

    try {
      // Verify webhook signature
      const sig = event.headers['stripe-signature'];
      const stripeEvent = stripe.webhooks.constructEvent(
        event.body,
        sig,
        endpointSecret
      );

      logger.info('Stripe webhook received', { type: stripeEvent.type });

      switch (stripeEvent.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(stripeEvent.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(stripeEvent.data.object as Stripe.PaymentIntent);
          break;
        case 'refund.created':
        case 'refund.updated':
          await this.handleRefundUpdate(stripeEvent.data.object as Stripe.Refund);
          break;
        default:
          logger.info('Unhandled webhook event type', { type: stripeEvent.type });
      }
    } catch (error) {
      logger.error('Webhook processing failed', { error });
      throw error;
    }
  }

  private async handlePaymentSuccess(stripePaymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = stripePaymentIntent.metadata.payment_intent_id;

    // Update payment intent status
    await this.auroraClient.query(
      `UPDATE payment_intents 
       SET status = 'succeeded', updated_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), paymentIntentId]
    );

    // Update booking status
    const bookingId = stripePaymentIntent.metadata.booking_id;
    await this.auroraClient.query(
      `UPDATE bookings 
       SET payment_status = 'paid', status = 'confirmed', updated_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), bookingId]
    );

    logger.info('Payment success handled', { paymentIntentId, bookingId });
  }

  private async handlePaymentFailure(stripePaymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentIntentId = stripePaymentIntent.metadata.payment_intent_id;

    // Update payment intent status
    await this.auroraClient.query(
      `UPDATE payment_intents 
       SET status = 'failed', updated_at = $1
       WHERE id = $2`,
      [new Date().toISOString(), paymentIntentId]
    );

    logger.info('Payment failure handled', { paymentIntentId });
  }

  private async handleRefundUpdate(stripeRefund: Stripe.Refund): Promise<void> {
    await this.auroraClient.query(
      `UPDATE refunds 
       SET status = $1, updated_at = $2
       WHERE stripe_refund_id = $3`,
      [stripeRefund.status, new Date().toISOString(), stripeRefund.id]
    );

    logger.info('Refund update handled', { refundId: stripeRefund.id, status: stripeRefund.status });
  }
}