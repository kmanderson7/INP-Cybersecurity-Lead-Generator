import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User, Mail, ExternalLink } from 'lucide-react';

const CalendarScheduler = ({ lead, onScheduled, onClose, netlifyAPI }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [meetingType, setMeetingType] = useState('initial');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Generate available time slots for the next 2 weeks
  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();

    // Generate dates for next 14 days (excluding weekends)
    for (let i = 1; i <= 14; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dateStr = date.toISOString().split('T')[0];

      // Generate time slots from 9 AM to 5 PM
      const times = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
      ];

      slots.push({
        date: dateStr,
        dateDisplay: date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }),
        times: times
      });
    }

    return slots;
  };

  const timeSlots = generateTimeSlots();

  const handleSchedule = async () => {
    if (!selectedDate || !selectedTime) {
      alert('Please select a date and time');
      return;
    }

    setIsLoading(true);

    try {
      const meetingData = {
        leadId: lead.id,
        contactInfo: {
          name: lead.executives?.[0]?.name || 'Unknown',
          email: lead.executives?.[0]?.email || '',
          company: lead.company,
          title: lead.executives?.[0]?.title || ''
        },
        timeSlot: {
          date: selectedDate,
          time: selectedTime,
          duration: duration,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        meetingType,
        notes,
        subject: `Cybersecurity Discussion - ${lead.company}`
      };

      // Call the scheduling function
      const result = await netlifyAPI.scheduleCall(
        lead.id,
        meetingData.contactInfo,
        meetingData.timeSlot
      );

      if (result.success) {
        // Update lead status and activity
        onScheduled(lead.id, {
          type: 'meeting_scheduled',
          date: selectedDate,
          time: selectedTime,
          duration,
          meetingType,
          calendarLink: result.calendarLink,
          meetingId: result.meetingId
        });

        onClose();
      } else {
        throw new Error(result.error || 'Failed to schedule meeting');
      }
    } catch (error) {
      console.error('Scheduling error:', error);
      alert(`Failed to schedule meeting: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const meetingTypes = [
    { value: 'initial', label: 'Initial Discovery', duration: 30 },
    { value: 'assessment', label: 'Security Assessment', duration: 60 },
    { value: 'demo', label: 'Solution Demo', duration: 45 },
    { value: 'followup', label: 'Follow-up Discussion', duration: 30 }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl mx-4 max-h-[90vh] overflow-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span>Schedule Meeting - {lead?.company}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              Meeting with:
            </h3>
            <div className="flex items-center gap-4">
              <div>
                <p className="font-medium">{lead?.executives?.[0]?.name || 'Contact Name'}</p>
                <p className="text-sm text-gray-600">{lead?.executives?.[0]?.title || 'Title'}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                {lead?.executives?.[0]?.email || 'email@example.com'}
              </div>
            </div>
          </div>

          {/* Meeting Type Selection */}
          <div>
            <h3 className="font-medium mb-3">Meeting Type</h3>
            <div className="grid grid-cols-2 gap-3">
              {meetingTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={meetingType === type.value ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => {
                    setMeetingType(type.value);
                    setDuration(type.duration);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <div className="text-left">
                      <div>{type.label}</div>
                      <div className="text-xs opacity-70">{type.duration} min</div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Date and Time Selection */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-3">Select Date</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {timeSlots.slice(0, 7).map((slot) => (
                  <Button
                    key={slot.date}
                    variant={selectedDate === slot.date ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => {
                      setSelectedDate(slot.date);
                      setSelectedTime(''); // Reset time when date changes
                    }}
                  >
                    {slot.dateDisplay}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-3">Select Time</h3>
              {selectedDate ? (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {timeSlots
                    .find(slot => slot.date === selectedDate)
                    ?.times.map((time) => (
                      <Button
                        key={time}
                        variant={selectedTime === time ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTime(time)}
                      >
                        {time}
                      </Button>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Please select a date first</p>
              )}
            </div>
          </div>

          {/* Meeting Notes */}
          <div>
            <h3 className="font-medium mb-2">Meeting Notes (Optional)</h3>
            <textarea
              className="w-full p-3 border rounded-lg resize-none"
              rows={3}
              placeholder="Add any specific topics or context for this meeting..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Selected Meeting Summary */}
          {selectedDate && selectedTime && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2 text-blue-800">Meeting Summary</h3>
              <div className="space-y-1 text-sm text-blue-700">
                <p><strong>Type:</strong> {meetingTypes.find(t => t.value === meetingType)?.label}</p>
                <p><strong>Duration:</strong> {duration} minutes</p>
                <p><strong>Date:</strong> {new Date(selectedDate + 'T' + selectedTime).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</p>
                <p><strong>Time:</strong> {selectedTime}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={handleSchedule}
              disabled={!selectedDate || !selectedTime || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Meeting
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>

          {/* Calendar Integration Note */}
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <div className="flex items-center gap-2 mb-1">
              <ExternalLink className="h-3 w-3" />
              <strong>Calendar Integration</strong>
            </div>
            <p>Meeting invites will be sent automatically. Calendar links will be generated for both parties.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CalendarScheduler;