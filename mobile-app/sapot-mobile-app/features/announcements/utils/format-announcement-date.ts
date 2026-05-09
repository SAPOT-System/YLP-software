const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatAnnouncementDate(createdAt: string): {
  label: string;
  isRecent: boolean;
} {
  const date = new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const formatted = dateFormatter.format(date);

  if (diffHours < 1) {
    return { label: `Now · ${formatted}`, isRecent: true };
  }
  return { label: formatted, isRecent: false };
}
