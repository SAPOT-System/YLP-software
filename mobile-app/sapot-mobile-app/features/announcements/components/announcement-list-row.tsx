import { APP_ROUTES } from '@/config/routes';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { useAnnouncementNewCount } from '../hooks/use-announcement-new-count';
import { useAnnouncements } from '../hooks/use-announcements';
import { formatAnnouncementDate } from '../utils/format-announcement-date';

export const AnnouncementListRow = React.memo(function AnnouncementListRow() {
  const router = useRouter();
  const theme = useTheme();
  const { data } = useAnnouncements();
  const { newCount } = useAnnouncementNewCount(data?.announcements ?? []);

  const latest = data?.announcements
    ?.slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const preview = latest
    ? latest.content.length > 40
      ? latest.content.slice(0, 40) + '…'
      : latest.content
    : 'No announcements yet';

  return (
    <Pressable
      onPress={() => router.push(APP_ROUTES.ANNOUNCEMENTS)}
      style={[
        styles.row,
        {
          borderColor: theme.dark ? '#0B1020' : '#EEEEEE',
          backgroundColor: theme.dark ? '#121A2E' : '#fff',
        },
      ]}
    >
      <View style={styles.iconWrapper}>
        <Icon source="bullhorn" size={26} color="#92400E" />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: theme.dark ? '#E6ECF5' : '#1E1E1E' }]}>
          Admin Announcements
        </Text>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.subtitle, { color: theme.dark ? '#6E7891' : '#6B7280' }]}
        >
          {preview}
        </Text>
      </View>
      {latest && (
        <Text style={[styles.date, { color: theme.dark ? '#6E7891' : '#6B7280' }]}>
          {formatAnnouncementDate(latest.created_at).label}
        </Text>
      )}
      {newCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{newCount}</Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRadius: 4,
    gap: 16,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f8ffad',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 17,
  },
  badge: {
    backgroundColor: '#E80000',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
    flexShrink: 0,
  },
});
