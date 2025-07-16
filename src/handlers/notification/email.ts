import { SQSEvent, SQSRecord } from 'aws-lambda';

export const handler = async (event: SQSEvent): Promise<void> => {
  try {
    console.log('Processing email notifications:', event.Records.length);

    for (const record of event.Records) {
      await sendEmailNotification(record);
    }
  } catch (error) {
    console.error('Email notification error:', error);
    throw error;
  }
};

async function sendEmailNotification(record: SQSRecord): Promise<void> {
  try {
    const message = JSON.parse(record.body);
    console.log('Sending email notification:', message);

    // TODO: Implement email sending logic
    // - Use AWS SES to send emails
    // - Handle email templates
    // - Track delivery status

  } catch (error) {
    console.error('Failed to send email notification:', error);
    throw error;
  }
}