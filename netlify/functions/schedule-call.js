const { sendEmail } = require('../lib/email');

const handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { leadId, contactInfo, timeSlot, meetingType, notes, subject } = JSON.parse(event.body);

    // Basic validation
    if (!leadId || !contactInfo || !timeSlot) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Create meeting date/time
    const meetingDateTime = new Date(`${timeSlot.date}T${timeSlot.time}:00`);
    const endDateTime = new Date(meetingDateTime.getTime() + (timeSlot.duration * 60000));

    // Generate calendar event (ICS format)
    const icsEvent = generateICSEvent({
      title: subject || `Cybersecurity Discussion - ${contactInfo.company}`,
      startTime: meetingDateTime,
      endTime: endDateTime,
      description: `Meeting with ${contactInfo.name} (${contactInfo.title}) from ${contactInfo.company}.\n\nMeeting Type: ${meetingType}\n${notes ? `Notes: ${notes}` : ''}`,
      attendees: [contactInfo.email],
      organizer: process.env.ORGANIZER_EMAIL || 'noreply@inp2.com',
      location: 'Video Call (link to be shared)',
      timezone: timeSlot.timezone || 'America/Denver'
    });

    // Generate Google Calendar link
    const googleCalendarLink = generateGoogleCalendarLink({
      title: subject || `Cybersecurity Discussion - ${contactInfo.company}`,
      startTime: meetingDateTime,
      endTime: endDateTime,
      description: `Meeting with ${contactInfo.name} (${contactInfo.title}) from ${contactInfo.company}.`,
      attendees: [contactInfo.email]
    });

    // Generate Outlook link
    const outlookLink = generateOutlookLink({
      title: subject || `Cybersecurity Discussion - ${contactInfo.company}`,
      startTime: meetingDateTime,
      endTime: endDateTime,
      description: `Meeting with ${contactInfo.name} (${contactInfo.title}) from ${contactInfo.company}.`
    });

    // Prepare email content
    const emailSubject = `Meeting Scheduled: ${subject || 'Cybersecurity Discussion'}`;
    const emailBody = generateMeetingEmailBody({
      contactName: contactInfo.name,
      company: contactInfo.company,
      meetingDateTime,
      duration: timeSlot.duration,
      meetingType,
      notes,
      googleCalendarLink,
      outlookLink
    });

    // Send email notification (if email service is configured)
    let emailSent = false;
    if (process.env.EMAIL_SERVICE_ENABLED === 'true') {
      try {
        await sendEmail({
          to: contactInfo.email,
          subject: emailSubject,
          body: emailBody,
          attachments: [{
            filename: 'meeting.ics',
            content: icsEvent,
            contentType: 'text/calendar'
          }]
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the whole operation if email fails
      }
    }

    // Generate unique meeting ID
    const meetingId = `meet_${leadId}_${Date.now()}`;

    // Log the meeting for audit/tracking
    console.log('Meeting scheduled:', {
      meetingId,
      leadId,
      contactInfo: { ...contactInfo, email: '[REDACTED]' },
      timeSlot,
      emailSent
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        meetingId,
        calendarLink: googleCalendarLink,
        outlookLink,
        icsContent: icsEvent,
        emailSent,
        message: `Meeting scheduled for ${meetingDateTime.toLocaleDateString()} at ${meetingDateTime.toLocaleTimeString()}`
      })
    };

  } catch (error) {
    console.error('Schedule call error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to schedule meeting',
        message: error.message
      })
    };
  }
};

// Generate ICS (iCalendar) format event
function generateICSEvent(event) {
  const formatDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//INP2//Cybersecurity Lead Generator//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@inp2.com`,
    `DTSTART:${formatDate(event.startTime)}`,
    `DTEND:${formatDate(event.endTime)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    `ORGANIZER;CN=INP2 Team:MAILTO:${event.organizer}`,
    ...event.attendees.map(email => `ATTENDEE;CN=${email}:MAILTO:${email}`),
    `LOCATION:${event.location}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    `DTSTAMP:${formatDate(new Date())}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

// Generate Google Calendar link
function generateGoogleCalendarLink(event) {
  const formatGoogleDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(event.startTime)}/${formatGoogleDate(event.endTime)}`,
    details: event.description,
    add: event.attendees.join(',')
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate Outlook calendar link
function generateOutlookLink(event) {
  const formatOutlookDate = (date) => {
    return date.toISOString();
  };

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: formatOutlookDate(event.startTime),
    enddt: formatOutlookDate(event.endTime),
    body: event.description
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// Generate email body for meeting notification
function generateMeetingEmailBody(data) {
  const { contactName, company, meetingDateTime, duration, meetingType, notes, googleCalendarLink, outlookLink } = data;

  const formattedDate = meetingDateTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = meetingDateTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return `
Dear ${contactName},

Thank you for your time! I've scheduled our cybersecurity discussion as requested.

Meeting Details:
• Date: ${formattedDate}
• Time: ${formattedTime}
• Duration: ${duration} minutes
• Type: ${meetingType}
• Company: ${company}

${notes ? `Meeting Notes:\n${notes}\n` : ''}

To add this meeting to your calendar, please use one of the following links:
• Google Calendar: ${googleCalendarLink}
• Outlook: ${outlookLink}

We'll send the video conference link closer to the meeting time.

Looking forward to our discussion about ${company}'s cybersecurity needs.

Best regards,
INP² Team

---
This meeting was scheduled through the INP² Cybersecurity Lead Generator.
If you need to reschedule, please reply to this email.
`.trim();
}

module.exports = { handler };