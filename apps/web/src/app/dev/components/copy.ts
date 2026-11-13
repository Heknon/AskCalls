/** Sample copy for the gallery in both languages, worded as in docs/design/screens.md. */
export const common = {
  en: {
    star: 'Star',
    unstar: 'Unstar',
    hiddenNumber: 'Hidden number',
    direction: { incoming: 'Incoming', outgoing: 'Outgoing', unknown: 'Unknown direction' },
    moreActions: 'More actions',
    decrypting: 'Decrypting',
    playFrom: (t: string) => `Play from ${t}`,
    noRecording: 'No recording saved for this call',
    you: 'You',
    cancel: 'Cancel',
    remove: (t: string) => `Remove ${t}`,
    retry: 'Retry',
    tryAgain: 'Try again',
    save: { saving: 'Saving…', saved: 'Saved', error: "Couldn't save.", retry: 'Retry' },
    device: 'Your device',
    server: 'AskCalls',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
  },
  he: {
    star: 'סימון בכוכב',
    unstar: 'הסרת כוכב',
    hiddenNumber: 'מספר חסוי',
    direction: { incoming: 'נכנסת', outgoing: 'יוצאת', unknown: 'כיוון לא ידוע' },
    moreActions: 'פעולות נוספות',
    decrypting: 'מפענח',
    playFrom: (t: string) => `ניגון מ-${t}`,
    noRecording: 'לא נשמרה הקלטה לשיחה הזאת',
    you: 'אני',
    cancel: 'ביטול',
    remove: (t: string) => `הסרת ${t}`,
    retry: 'ניסיון חוזר',
    tryAgain: 'ניסיון חוזר',
    save: { saving: 'שומר…', saved: 'נשמר', error: 'השמירה נכשלה.', retry: 'ניסיון חוזר' },
    device: 'המכשיר שלך',
    server: 'AskCalls',
    copy: 'העתקה',
    copied: 'הועתק',
    close: 'סגירה',
  },
};

export const rowA11y = {
  en: (contact: string, dir: string, when: string, dur: string) =>
    `${contact}, ${dir}, ${when}, ${dur}`,
  he: (contact: string, dir: string, when: string, dur: string) =>
    `${contact}, ${dir}, ${when}, ${dur}`,
};
