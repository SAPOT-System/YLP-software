import { AnnouncementPriority } from '../types';
import { formatAnnouncementDate } from '../utils/format-announcement-date';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

type Props = {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  created_at: string;
};

const PRIORITY_CONFIG: Record<
  AnnouncementPriority,
  { iconBg: string; badgeBg: string; headerBg: string; label: string }
> = {
  high: {
    iconBg: '#EF4444',
    badgeBg: '#EF4444',
    headerBg: '#FEE2E2',
    label: 'HIGH',
  },
  normal: {
    iconBg: '#F59E0B',
    badgeBg: '#F59E0B',
    headerBg: '#FEF9C3',
    label: 'MEDIUM',
  },
  low: {
    iconBg: '#6B7280',
    badgeBg: '#6B7280',
    headerBg: '#F3F4F6',
    label: 'LOW',
  },
};

export function AnnouncementCard({ title, content, priority, created_at }: Props) {
  const cfg = PRIORITY_CONFIG[priority];
  const { label: dateLabel, isRecent } = formatAnnouncementDate(created_at);

  return (
    <View style={styles.card}>
      <View style={[styles.header, { backgroundColor: cfg.headerBg }]}>
        <View style={[styles.iconCircle, { backgroundColor: cfg.iconBg }]}>
          <Icon source="bullhorn" size={22} color="#fff" />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.date, isRecent && styles.dateRecent]}>
            {isRecent && (
              <Text style={styles.nowDot}>● </Text>
            )}
            {dateLabel}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: cfg.badgeBg }]}>
          <Text style={styles.badgeText}>{cfg.label}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.content} numberOfLines={2}>
          {content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  date: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  dateRecent: {
    color: '#16A34A',
  },
  nowDot: {
    color: '#16A34A',
    fontSize: 10,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  content: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
