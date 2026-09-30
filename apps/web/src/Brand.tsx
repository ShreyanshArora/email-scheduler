/** ReachInbox Scheduler mark: an outgoing envelope with a scheduled clock. */
export function Brand() {
  return <div className="brand-logo" aria-label="ReachInbox Scheduler">
    <svg viewBox="0 0 44 44" aria-hidden="true" fill="none">
      <rect x="2" y="5" width="34" height="29" rx="8" fill="#05A83E" />
      <path d="M9 14L19 21L29 14M9 14V27H29V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="31" r="10" fill="white" stroke="#05A83E" strokeWidth="2.5" />
      <path d="M32 25.5V31L35.5 33" stroke="#05A83E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span><strong>ReachInbox</strong><small>scheduler</small></span>
  </div>;
}
