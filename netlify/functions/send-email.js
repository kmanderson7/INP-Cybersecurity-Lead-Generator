import { jsonResponse, errorResponse, successResponse } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse('Method Not Allowed', 405);
  }

  const clientIP = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'anonymous';
  const rateCheck = checkRateLimit(`email_${clientIP}`, 10, 60 * 60 * 1000); // 10 emails per hour

  if (!rateCheck.allowed) {
    return errorResponse('Email rate limit exceeded', 429);
  }

  try {
    const {
      to,
      subject,
      body,
      leadId,
      leadName,
      persona = 'CISO',
      tone = 'professional'
    } = JSON.parse(event.body || '{}');

    if (!to || !subject || !body) {
      return errorResponse('Missing required fields: to, subject, body', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return errorResponse('Invalid email format', 400);
    }

    const emailProvider = process.env.EMAIL_PROVIDER || 'sendgrid';
    const hasProviderKey = (emailProvider === 'sendgrid' && process.env.SENDGRID_API_KEY)
      || (emailProvider === 'mailgun' && process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);

    const result = hasProviderKey
      ? emailProvider === 'mailgun'
        ? await sendWithMailgun(to, subject, body, leadId)
        : await sendWithSendGrid(to, subject, body, leadId)
      : await mockSendEmail(to, subject, body, leadId);

    return successResponse({
      messageId: result.messageId,
      status: result.status,
      provider: emailProvider,
      leadId,
      leadName,
      persona,
      tone,
      timestamp: new Date().toISOString()
    }, {
      source: hasProviderKey ? 'provider_live' : 'simulated',
      provider: hasProviderKey ? emailProvider : 'email_simulator',
      reason: hasProviderKey ? undefined : 'No configured email provider key was available; the send was simulated.',
      confidence: hasProviderKey ? 0.88 : 0.22
    });

  } catch (error) {
    console.error('Error sending email:', error);
    return errorResponse('Failed to send email', 500, {
      source: 'provider_fallback',
      provider: process.env.EMAIL_PROVIDER || 'email'
    });
  }
}

async function sendWithSendGrid(to, subject, body, leadId) {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    throw new Error('SendGrid API key not configured');
  }

  const msg = {
    to,
    from: process.env.FROM_EMAIL || 'noreply@inp2.com',
    subject,
    html: body,
    text: body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    custom_args: {
      lead_id: leadId
    }
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(msg)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid error: ${error}`);
    }

    return {
      messageId: response.headers.get('x-message-id') || 'sendgrid_' + Date.now(),
      status: 'sent'
    };

  } catch (error) {
    console.error('SendGrid error:', error);
    throw error;
  }
}

async function sendWithMailgun(to, subject, body, leadId) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error('Mailgun API key or domain not configured');
  }

  const formData = new FormData();
  formData.append('from', process.env.FROM_EMAIL || `INP2 Security <noreply@${domain}>`);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('html', body);
  formData.append('text', body.replace(/<[^>]*>/g, ''));
  formData.append('o:tag', 'lead-outreach');
  formData.append('v:lead_id', leadId);

  try {
    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mailgun error: ${error}`);
    }

    const result = await response.json();
    return {
      messageId: result.id,
      status: 'sent'
    };

  } catch (error) {
    console.error('Mailgun error:', error);
    throw error;
  }
}

async function mockSendEmail(to, subject, body, leadId) {
  // Mock email sending for development/demo
  console.log('Mock Email Send:', {
    to,
    subject,
    bodyLength: body.length,
    leadId,
    timestamp: new Date().toISOString()
  });

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    messageId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'sent_mock'
  };
}
