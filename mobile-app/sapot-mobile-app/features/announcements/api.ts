import { apiClient } from '@/features/shared/api/client';
import { GetAnnouncementsResponse } from './types';

export async function getAnnouncements(): Promise<GetAnnouncementsResponse> {
  const { data } = await apiClient.get<GetAnnouncementsResponse>(
    '/user-utils/get-announcements',
    { params: { limit: 50, offset: 0 } }
  );
  return data;
}
