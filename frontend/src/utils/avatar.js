export function getAvatarClass(name) {
  if (!name) return 'av-aisha';
  const charCode = name.toLowerCase().charCodeAt(0);
  if (charCode < 100) return 'av-aisha';
  if (charCode < 105) return 'av-rohan';
  if (charCode < 110) return 'av-priya';
  if (charCode < 115) return 'av-dev';
  if (charCode < 120) return 'av-meera';
  return 'av-sam';
}

export function getInitials(name) {
  if (!name) return 'U';
  return name.substring(0, 1).toUpperCase();
}
