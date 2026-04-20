/**
 * EMP_InboxPage — Phase G9.R5 alias.
 *
 * The unified inbox lives at <InboxPage>. This file is kept as a re-export
 * so the existing /bdm/inbox URL (and any deep links / bookmarks / docs)
 * keeps working without redirects. New code should import InboxPage
 * directly from '../common/InboxPage'.
 */
export { default } from '../common/InboxPage';
