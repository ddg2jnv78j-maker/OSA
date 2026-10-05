import { LanguageCode } from '../types/osa';

export interface TranslationDictionary {
  appName: string;
  tagline: string;
  // Auth
  login: string;
  register: string;
  createAccount: string;
  forgotPassword: string;
  resetPassword: string;
  sendResetLink: string;
  backToLogin: string;
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  newPassword: string;
  updatePassword: string;
  logout: string;
  // Navigation
  chats: string;
  status: string;
  groups: string;
  calls: string;
  settings: string;
  // Chats & Home
  searchPlaceholder: string;
  newChat: string;
  noChatsYet: string;
  startNewConversation: string;
  online: string;
  offline: string;
  typing: string;
  typeMessage: string;
  send: string;
  reply: string;
  copy: string;
  forward: string;
  deleteForMe: string;
  deleteForEveryone: string;
  messageDeleted: string;
  chatInfo: string;
  clearChat: string;
  muteNotifications: string;
  unmuteNotifications: string;
  searchInConversation: string;
  media: string;
  files: string;
  links: string;
  // Status
  myStatus: string;
  addStatus: string;
  recentUpdates: string;
  textStatus: string;
  imageStatus: string;
  videoStatus: string;
  statusViewers: string;
  deleteStatus: string;
  noStatusUpdates: string;
  // Groups
  createGroup: string;
  groupName: string;
  groupDescription: string;
  groupMembers: string;
  addMembers: string;
  removeMember: string;
  leaveGroup: string;
  deleteGroup: string;
  groupInfo: string;
  admin: string;
  member: string;
  // Calls
  audioCall: string;
  videoCall: string;
  incomingCall: string;
  outgoingCall: string;
  missedCall: string;
  calling: string;
  ringing: string;
  connected: string;
  callEnded: string;
  accept: string;
  reject: string;
  endCall: string;
  mute: string;
  unmute: string;
  cameraOn: string;
  cameraOff: string;
  switchCamera: string;
  noCallsYet: string;
  // Settings & Profile
  profile: string;
  editProfile: string;
  changePhoto: string;
  changeName: string;
  changeAbout: string;
  account: string;
  privacy: string;
  notifications: string;
  appearance: string;
  language: string;
  storageAndData: string;
  blockedContacts: string;
  helpAndSupport: string;
  aboutOSA: string;
  saveChanges: string;
  cancel: string;
  confirm: string;
  // Privacy & Block & Report
  lastSeen: string;
  profilePhoto: string;
  aboutInfo: string;
  readReceipts: string;
  typingIndicator: string;
  onlineStatus: string;
  statusVisibility: string;
  everyone: string;
  contacts: string;
  nobody: string;
  blockUser: string;
  unblockUser: string;
  reportUser: string;
  // Appearance & Language
  lightMode: string;
  darkMode: string;
  systemDefault: string;
  english: string;
  bengali: string;
  // Account & Help
  changeEmail: string;
  changePassword: string;
  deleteAccount: string;
  faq: string;
  userGuide: string;
  contactSupport: string;
  reportProblem: string;
  termsAndConditions: string;
  privacyPolicy: string;
  markAllRead: string;
  reconnecting: string;
  connectedRealtime: string;
}

export const TRANSLATIONS: Record<LanguageCode, TranslationDictionary> = {
  en: {
    appName: 'OSA',
    tagline: 'Real-Time Messaging, Status, Groups & Calling',
    login: 'Login',
    register: 'Register',
    createAccount: 'Create Account',
    forgotPassword: 'Forgot Password?',
    resetPassword: 'Reset Password',
    sendResetLink: 'Send Reset Email',
    backToLogin: 'Back to Login',
    email: 'Email Address',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    fullName: 'Full Name',
    newPassword: 'New Password',
    updatePassword: 'Update Password',
    logout: 'Logout',
    chats: 'Chats',
    status: 'Status',
    groups: 'Groups',
    calls: 'Calls',
    settings: 'Settings',
    searchPlaceholder: 'Search users, chats, groups, or messages...',
    newChat: 'New Chat',
    noChatsYet: 'No conversations yet',
    startNewConversation: 'Search for a user on OSA to start chatting in real time.',
    online: 'Online',
    offline: 'Offline',
    typing: 'typing...',
    typeMessage: 'Write a message...',
    send: 'Send',
    reply: 'Reply',
    copy: 'Copy',
    forward: 'Forward',
    deleteForMe: 'Delete for me',
    deleteForEveryone: 'Delete for everyone',
    messageDeleted: 'This message was deleted',
    chatInfo: 'Chat Info',
    clearChat: 'Clear Chat',
    muteNotifications: 'Mute Notifications',
    unmuteNotifications: 'Unmute Notifications',
    searchInConversation: 'Search in Conversation',
    media: 'Media',
    files: 'Files',
    links: 'Links',
    myStatus: 'My Status',
    addStatus: 'Add Status',
    recentUpdates: 'Recent Updates',
    textStatus: 'Text Status',
    imageStatus: 'Image Status',
    videoStatus: 'Video Status',
    statusViewers: 'Viewers',
    deleteStatus: 'Delete Status',
    noStatusUpdates: 'No active status updates from the last 24 hours.',
    createGroup: 'Create Group',
    groupName: 'Group Name',
    groupDescription: 'Group Description',
    groupMembers: 'Group Members',
    addMembers: 'Add Members',
    removeMember: 'Remove Member',
    leaveGroup: 'Leave Group',
    deleteGroup: 'Delete Group',
    groupInfo: 'Group Info',
    admin: 'Admin',
    member: 'Member',
    audioCall: 'Audio Call',
    videoCall: 'Video Call',
    incomingCall: 'Incoming Call',
    outgoingCall: 'Outgoing Call',
    missedCall: 'Missed Call',
    calling: 'Calling...',
    ringing: 'Ringing...',
    connected: 'Connected',
    callEnded: 'Call Ended',
    accept: 'Accept',
    reject: 'Reject',
    endCall: 'End Call',
    mute: 'Mute',
    unmute: 'Unmute',
    cameraOn: 'Camera On',
    cameraOff: 'Camera Off',
    switchCamera: 'Switch Camera',
    noCallsYet: 'No call history yet',
    profile: 'Profile',
    editProfile: 'Edit Profile',
    changePhoto: 'Change Photo',
    changeName: 'Change Name',
    changeAbout: 'Change About',
    account: 'Account',
    privacy: 'Privacy',
    notifications: 'Notifications',
    appearance: 'Appearance',
    language: 'Language',
    storageAndData: 'Storage & Data',
    blockedContacts: 'Blocked Contacts',
    helpAndSupport: 'Help & Support',
    aboutOSA: 'About OSA',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    confirm: 'Confirm',
    lastSeen: 'Last Seen',
    profilePhoto: 'Profile Photo',
    aboutInfo: 'About',
    readReceipts: 'Read Receipts',
    typingIndicator: 'Typing Indicator',
    onlineStatus: 'Online Status',
    statusVisibility: 'Status Visibility',
    everyone: 'Everyone',
    contacts: 'Contacts',
    nobody: 'Nobody',
    blockUser: 'Block User',
    unblockUser: 'Unblock User',
    reportUser: 'Report User',
    lightMode: 'Light',
    darkMode: 'Dark',
    systemDefault: 'System',
    english: 'English',
    bengali: 'বাংলা (Bengali)',
    changeEmail: 'Change Email',
    changePassword: 'Change Password',
    deleteAccount: 'Delete Account',
    faq: 'FAQ',
    userGuide: 'User Guide',
    contactSupport: 'Contact Support',
    reportProblem: 'Report a Problem',
    termsAndConditions: 'Terms & Conditions',
    privacyPolicy: 'Privacy Policy',
    markAllRead: 'Mark All Read',
    reconnecting: 'Reconnecting to OSA Realtime...',
    connectedRealtime: 'Realtime Connected',
  },
  bn: {
    appName: 'OSA',
    tagline: 'রিয়েল-টাইম মেসেজিং, স্ট্যাটাস, গ্রুপ এবং কলিং',
    login: 'লগইন করুন',
    register: 'নিবন্ধন করুন',
    createAccount: 'অ্যাকাউন্ট তৈরি করুন',
    forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
    resetPassword: 'পাসওয়ার্ড রিসেট করুন',
    sendResetLink: 'রিসেট ইমেইল পাঠান',
    backToLogin: 'লগইনে ফিরে যান',
    email: 'ইমেইল ঠিকানা',
    password: 'পাসওয়ার্ড',
    confirmPassword: 'পাসওয়ার্ড নিশ্চিত করুন',
    fullName: 'পূর্ণ নাম',
    newPassword: 'নতুন পাসওয়ার্ড',
    updatePassword: 'পাসওয়ার্ড আপডেট করুন',
    logout: 'লগআউট',
    chats: 'চ্যাট',
    status: 'স্ট্যাটাস',
    groups: 'গ্রুপ',
    calls: 'কল',
    settings: 'সেটিংস',
    searchPlaceholder: 'ব্যবহারকারী, চ্যাট, গ্রুপ বা বার্তা খুঁজুন...',
    newChat: 'নতুন চ্যাট',
    noChatsYet: 'এখনও কোনো কথোপকথন নেই',
    startNewConversation: 'রিয়েল-টাইমে চ্যাট শুরু করতে OSA ব্যবহারকারী খুঁজুন।',
    online: 'অনলাইন',
    offline: 'অফলাইন',
    typing: 'টাইপ করছেন...',
    typeMessage: 'একটি বার্তা লিখুন...',
    send: 'পাঠান',
    reply: 'উত্তর দিন',
    copy: 'কপি করুন',
    forward: 'ফরওয়ার্ড করুন',
    deleteForMe: 'আমার জন্য মুছুন',
    deleteForEveryone: 'সবার জন্য মুছুন',
    messageDeleted: 'এই বার্তাটি মুছে ফেলা হয়েছে',
    chatInfo: 'চ্যাট তথ্য',
    clearChat: 'চ্যাট পরিষ্কার করুন',
    muteNotifications: 'নোটিফিকেশন মিউট করুন',
    unmuteNotifications: 'নোটিফিকেশন আনমিউট করুন',
    searchInConversation: 'কথোপকথনে খুঁজুন',
    media: 'মিডিয়া',
    files: 'ফাইল',
    links: 'লিংক',
    myStatus: 'আমার স্ট্যাটাস',
    addStatus: 'স্ট্যাটাস যোগ করুন',
    recentUpdates: 'সাম্প্রতিক আপডেট',
    textStatus: 'টেক্সট স্ট্যাটাস',
    imageStatus: 'ছবি স্ট্যাটাস',
    videoStatus: 'ভিডিও স্ট্যাটাস',
    statusViewers: 'দর্শক',
    deleteStatus: 'স্ট্যাটাস মুছুন',
    noStatusUpdates: 'গত ২৪ ঘণ্টায় কোনো সক্রিয় স্ট্যাটাস আপডেট নেই।',
    createGroup: 'গ্রুপ তৈরি করুন',
    groupName: 'গ্রুপের নাম',
    groupDescription: 'গ্রুপের বিবরণ',
    groupMembers: 'গ্রুপ সদস্যবৃন্দ',
    addMembers: 'সদস্য যোগ করুন',
    removeMember: 'সদস্য সরান',
    leaveGroup: 'গ্রুপ ত্যাগ করুন',
    deleteGroup: 'গ্রুপ মুছুন',
    groupInfo: 'গ্রুপ তথ্য',
    admin: 'অ্যাডমিন',
    member: 'সদস্য',
    audioCall: 'অডিও কল',
    videoCall: 'ভিডিও কল',
    incomingCall: 'ইনকামিং কল',
    outgoingCall: 'আউটগোয়িং কল',
    missedCall: 'মিসড কল',
    calling: 'কল করা হচ্ছে...',
    ringing: 'রিং হচ্ছে...',
    connected: 'সংযুক্ত',
    callEnded: 'কল শেষ হয়েছে',
    accept: 'গ্রহণ করুন',
    reject: 'প্রত্যাখ্যান করুন',
    endCall: 'কল শেষ করুন',
    mute: 'মিউট',
    unmute: 'আনমিউট',
    cameraOn: 'ক্যামেরা চালু',
    cameraOff: 'ক্যামেরা বন্ধ',
    switchCamera: 'ক্যামেরা পরিবর্তন',
    noCallsYet: 'এখনও কোনো কলের ইতিহাস নেই',
    profile: 'প্রোফাইল',
    editProfile: 'প্রোফাইল সম্পাদনা',
    changePhoto: 'ছবি পরিবর্তন করুন',
    changeName: 'নাম পরিবর্তন করুন',
    changeAbout: 'সম্পর্কে পরিবর্তন করুন',
    account: 'অ্যাকাউন্ট',
    privacy: 'গোপনীয়তা',
    notifications: 'নোটিফিকেশন',
    appearance: 'থিম ও চেহারা',
    language: 'ভাষা',
    storageAndData: 'স্টোরেজ এবং ডেটা',
    blockedContacts: 'ব্লক করা কন্টাক্ট',
    helpAndSupport: 'সহায়তা ও সাপোর্ট',
    aboutOSA: 'OSA সম্পর্কে',
    saveChanges: 'পরিবর্তন সংরক্ষণ করুন',
    cancel: 'বাতিল করুন',
    confirm: 'নিশ্চিত করুন',
    lastSeen: 'শেষ দেখা গেছে',
    profilePhoto: 'প্রোফাইল ছবি',
    aboutInfo: 'সম্পর্কে',
    readReceipts: 'রিড রিসিপ্ট',
    typingIndicator: 'টাইপিং নির্দেশক',
    onlineStatus: 'অনলাইন স্ট্যাটাস',
    statusVisibility: 'স্ট্যাটাস দৃশ্যমানতা',
    everyone: 'সবাই',
    contacts: 'কন্টাক্টস',
    nobody: 'কেউ না',
    blockUser: 'ব্যবহারকারী ব্লক করুন',
    unblockUser: 'আনব্লক করুন',
    reportUser: 'রিপোর্ট করুন',
    lightMode: 'হালকা (Light)',
    darkMode: 'গাঢ় (Dark)',
    systemDefault: 'সিস্টেম ডিফল্ট',
    english: 'English',
    bengali: 'বাংলা',
    changeEmail: 'ইমেইল পরিবর্তন করুন',
    changePassword: 'পাসওয়ার্ড পরিবর্তন করুন',
    deleteAccount: 'অ্যাকাউন্ট মুছে ফেলুন',
    faq: 'সাধারণ জিজ্ঞাসা (FAQ)',
    userGuide: 'ব্যবহারকারী নির্দেশিকা',
    contactSupport: 'সাপোর্টে যোগাযোগ করুন',
    reportProblem: 'সমস্যা রিপোর্ট করুন',
    termsAndConditions: 'শর্তাবলী',
    privacyPolicy: 'গোপনীয়তা নীতি',
    markAllRead: 'সব পঠিত হিসেবে চিহ্নিত করুন',
    reconnecting: 'OSA রিয়েলটাইমে পুনরায় সংযোগ হচ্ছে...',
    connectedRealtime: 'রিয়েলটাইম সংযুক্ত',
  },
};
