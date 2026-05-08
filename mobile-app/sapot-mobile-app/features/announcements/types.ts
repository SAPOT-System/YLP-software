export type AnnouncementPriority = 'low' | 'normal' | 'high';
export type AnnouncementStatus = 'active' | 'expired';
export type AudienceType = 'user' | 'rescuer' | 'admin';

export type Announcement = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  expires_at: string;
  target_audience: AudienceType;
  created_at: string;
};

export type GetAnnouncementsResponse = {
  role: string;
  count: number;
  announcements: Announcement[];
};

export type AnnouncementFilter = 'all' | 'high' | 'normal' | 'low';
