import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Client as LineClient } from '@line/bot-sdk';
import { logger } from '../utils/logger';
import { getTranslation } from '../utils/i18n';
import { Booking } from './booking-service';

export class NotificationService {
  private sesClient: SESClient;
  private snsClient: SNSClient;
  private lineClient?: LineClient;

  constructor() {
    this.sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
    this.snsClient = new SNSClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });

    if (process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET) {
      this.lineClient = new LineClient({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
        channelSecret: process.env.LINE_CHANNEL_SECRET,
      });
    }
  }

  async sendBookingConfirmation(booking: any): Promise<void> {
    const tasks = [];

    // Send email notification
    if (booking.patient_email) {
      tasks.push(this.sendEmail(
        booking.patient_email,
        await this.getEmailSubject('booking_confirmation', booking.preferred_language),
        await this.getBookingConfirmationEmailBody(booking)
      ));
    }

    // Send SMS notification
    if (booking.patient_phone) {
      tasks.push(this.sendSMS(
        booking.patient_phone,
        await this.getBookingConfirmationSMSBody(booking)
      ));
    }

    // Send LINE notification if user has LINE ID
    if (booking.patient_line_id && this.lineClient) {
      tasks.push(this.sendLineMessage(
        booking.patient_line_id,
        await this.getBookingConfirmationLineMessage(booking)
      ));
    }

    await Promise.allSettled(tasks);
  }

  async sendBookingUpdate(booking: any, updateType: string): Promise<void> {
    const tasks = [];

    if (booking.patient_email) {
      tasks.push(this.sendEmail(
        booking.patient_email,
        await this.getEmailSubject(`booking_${updateType}`, booking.preferred_language),
        await this.getBookingUpdateEmailBody(booking, updateType)
      ));
    }

    if (booking.patient_phone) {
      tasks.push(this.sendSMS(
        booking.patient_phone,
        await this.getBookingUpdateSMSBody(booking, updateType)
      ));
    }

    await Promise.allSettled(tasks);
  }

  async sendBookingCancellation(booking: any, reason: string): Promise<void> {
    const tasks = [];

    if (booking.patient_email) {
      tasks.push(this.sendEmail(
        booking.patient_email,
        await this.getEmailSubject('booking_cancelled', booking.preferred_language),
        await this.getBookingCancellationEmailBody(booking, reason)
      ));
    }

    if (booking.patient_phone) {
      tasks.push(this.sendSMS(
        booking.patient_phone,
        await this.getBookingCancellationSMSBody(booking, reason)
      ));
    }

    await Promise.allSettled(tasks);
  }

  async sendBookingReminder(booking: any, hoursBeforeAppointment: number): Promise<void> {
    const tasks = [];

    if (booking.patient_email) {
      tasks.push(this.sendEmail(
        booking.patient_email,
        await this.getEmailSubject('booking_reminder', booking.preferred_language),
        await this.getBookingReminderEmailBody(booking, hoursBeforeAppointment)
      ));
    }

    if (booking.patient_phone) {
      tasks.push(this.sendSMS(
        booking.patient_phone,
        await this.getBookingReminderSMSBody(booking, hoursBeforeAppointment)
      ));
    }

    await Promise.allSettled(tasks);
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      const command = new SendEmailCommand({
        Source: process.env.SES_FROM_EMAIL || 'noreply@clinic.example.com',
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: body,
              Charset: 'UTF-8',
            },
            Text: {
              Data: body.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
              Charset: 'UTF-8',
            },
          },
        },
      });

      await this.sesClient.send(command);
      logger.info('Email sent successfully', { to, subject });
    } catch (error) {
      logger.error('Failed to send email', { error, to, subject });
      throw error;
    }
  }

  private async sendSMS(phoneNumber: string, message: string): Promise<void> {
    try {
      const command = new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      });

      await this.snsClient.send(command);
      logger.info('SMS sent successfully', { phoneNumber });
    } catch (error) {
      logger.error('Failed to send SMS', { error, phoneNumber });
      throw error;
    }
  }

  private async sendLineMessage(lineUserId: string, message: any): Promise<void> {
    if (!this.lineClient) {
      logger.warn('LINE client not configured');
      return;
    }

    try {
      await this.lineClient.pushMessage(lineUserId, message);
      logger.info('LINE message sent successfully', { lineUserId });
    } catch (error) {
      logger.error('Failed to send LINE message', { error, lineUserId });
      throw error;
    }
  }

  private async getEmailSubject(type: string, language: string = 'ja'): Promise<string> {
    return getTranslation(`email.${type}.subject`, language);
  }

  private async getBookingConfirmationEmailBody(booking: any): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${getTranslation('email.booking_confirmation.title', lang)}</h2>
          <p>${getTranslation('email.booking_confirmation.greeting', lang)} ${booking.patient_name}${getTranslation('common.honorific', lang)}</p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>${getTranslation('email.booking_confirmation.details', lang)}</h3>
            <p><strong>${getTranslation('common.doctor', lang)}:</strong> ${booking.doctor_name}</p>
            <p><strong>${getTranslation('common.clinic', lang)}:</strong> ${booking.clinic_name}</p>
            <p><strong>${getTranslation('common.service', lang)}:</strong> ${booking.service_name}</p>
            <p><strong>${getTranslation('common.date', lang)}:</strong> ${appointmentDate.toLocaleDateString(lang)}</p>
            <p><strong>${getTranslation('common.time', lang)}:</strong> ${appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>${getTranslation('common.booking_id', lang)}:</strong> ${booking.id}</p>
          </div>
          
          <p>${getTranslation('email.booking_confirmation.instructions', lang)}</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">${getTranslation('email.common.footer', lang)}</p>
          </div>
        </body>
      </html>
    `;
  }

  private async getBookingConfirmationSMSBody(booking: any): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return getTranslation('sms.booking_confirmation', lang, {
      patient_name: booking.patient_name,
      doctor_name: booking.doctor_name,
      date: appointmentDate.toLocaleDateString(lang),
      time: appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
      booking_id: booking.id.slice(-6), // Last 6 characters for brevity
    });
  }

  private async getBookingConfirmationLineMessage(booking: any): Promise<any> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);

    return {
      type: 'flex',
      altText: getTranslation('line.booking_confirmation.alt_text', lang),
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: getTranslation('line.booking_confirmation.title', lang),
              weight: 'bold',
              size: 'lg',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: getTranslation('common.doctor', lang),
                  flex: 1,
                  color: '#666666',
                },
                {
                  type: 'text',
                  text: booking.doctor_name,
                  flex: 2,
                },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: getTranslation('common.date', lang),
                  flex: 1,
                  color: '#666666',
                },
                {
                  type: 'text',
                  text: appointmentDate.toLocaleDateString(lang),
                  flex: 2,
                },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: getTranslation('common.time', lang),
                  flex: 1,
                  color: '#666666',
                },
                {
                  type: 'text',
                  text: appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
                  flex: 2,
                },
              ],
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: getTranslation('line.booking_confirmation.view_details', lang),
                uri: `${process.env.WEB_APP_URL}/bookings/${booking.id}`,
              },
              style: 'primary',
            },
          ],
        },
      },
    };
  }

  private async getBookingUpdateEmailBody(booking: any, updateType: string): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${getTranslation(`email.booking_${updateType}.title`, lang)}</h2>
          <p>${getTranslation(`email.booking_${updateType}.greeting`, lang)} ${booking.patient_name}${getTranslation('common.honorific', lang)}</p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>${getTranslation('email.booking_update.new_details', lang)}</h3>
            <p><strong>${getTranslation('common.doctor', lang)}:</strong> ${booking.doctor_name}</p>
            <p><strong>${getTranslation('common.date', lang)}:</strong> ${appointmentDate.toLocaleDateString(lang)}</p>
            <p><strong>${getTranslation('common.time', lang)}:</strong> ${appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</p>
            <p><strong>${getTranslation('common.booking_id', lang)}:</strong> ${booking.id}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">${getTranslation('email.common.footer', lang)}</p>
          </div>
        </body>
      </html>
    `;
  }

  private async getBookingUpdateSMSBody(booking: any, updateType: string): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return getTranslation(`sms.booking_${updateType}`, lang, {
      patient_name: booking.patient_name,
      doctor_name: booking.doctor_name,
      date: appointmentDate.toLocaleDateString(lang),
      time: appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
    });
  }

  private async getBookingCancellationEmailBody(booking: any, reason: string): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${getTranslation('email.booking_cancelled.title', lang)}</h2>
          <p>${getTranslation('email.booking_cancelled.greeting', lang)} ${booking.patient_name}${getTranslation('common.honorific', lang)}</p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>${getTranslation('common.booking_id', lang)}:</strong> ${booking.id}</p>
            <p><strong>${getTranslation('common.doctor', lang)}:</strong> ${booking.doctor_name}</p>
            <p><strong>${getTranslation('common.reason', lang)}:</strong> ${reason}</p>
          </div>
          
          <p>${getTranslation('email.booking_cancelled.message', lang)}</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">${getTranslation('email.common.footer', lang)}</p>
          </div>
        </body>
      </html>
    `;
  }

  private async getBookingCancellationSMSBody(booking: any, reason: string): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    
    return getTranslation('sms.booking_cancelled', lang, {
      patient_name: booking.patient_name,
      booking_id: booking.id.slice(-6),
      reason: reason,
    });
  }

  private async getBookingReminderEmailBody(booking: any, hoursBeforeAppointment: number): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${getTranslation('email.booking_reminder.title', lang)}</h2>
          <p>${getTranslation('email.booking_reminder.greeting', lang)} ${booking.patient_name}${getTranslation('common.honorific', lang)}</p>
          
          <p>${getTranslation('email.booking_reminder.message', lang, { hours: hoursBeforeAppointment })}</p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>${getTranslation('email.booking_reminder.details', lang)}</h3>
            <p><strong>${getTranslation('common.doctor', lang)}:</strong> ${booking.doctor_name}</p>
            <p><strong>${getTranslation('common.clinic', lang)}:</strong> ${booking.clinic_name}</p>
            <p><strong>${getTranslation('common.date', lang)}:</strong> ${appointmentDate.toLocaleDateString(lang)}</p>
            <p><strong>${getTranslation('common.time', lang)}:</strong> ${appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #666; font-size: 12px;">${getTranslation('email.common.footer', lang)}</p>
          </div>
        </body>
      </html>
    `;
  }

  private async getBookingReminderSMSBody(booking: any, hoursBeforeAppointment: number): Promise<string> {
    const lang = booking.preferred_language || 'ja';
    const appointmentDate = new Date(booking.appointment_time);
    
    return getTranslation('sms.booking_reminder', lang, {
      patient_name: booking.patient_name,
      hours: hoursBeforeAppointment,
      date: appointmentDate.toLocaleDateString(lang),
      time: appointmentDate.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
      doctor_name: booking.doctor_name,
    });
  }
}