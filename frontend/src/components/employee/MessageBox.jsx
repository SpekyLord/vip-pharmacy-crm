/**
 * MessageBox Component
 *
 * Represents a single inbox message row with:
 * - Read / unread state
 * - Priority badge
 * - ✅ Inline expand message body (no dropdown meta panel)
 * - Mark read/unread toggle
 * - Reply UI (client-only)
 *
 * NOTE:
 * - Data is passed from parent
 * - No API calls here
 */

const MessageBox = ({
  message,
  activeTab,
  isOpen,
  onToggle,
  onToggleRead,
  formatDateTime,
  getTypeMeta,

  // Reply props (passed from EmployeeInbox)
  isReplyOpen,
  replyDraft,
  replies,
  onOpenReply,
  onCloseReply,
  onChangeReply,
  onSendReply,
}) => {
  const meta = getTypeMeta(message.category);

  return (
    <div className={`inbox-row ${isOpen ? "is-open" : ""}`}>
      {/* Main row */}
      <div
        className={`inbox-item ${message.read ? "is-read" : "is-unread"} ${
          isOpen ? "is-selected" : ""
        }`}
        onClick={() => onToggle(message)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle(message)}
      >
        <div className="left">
          <div className="avatar" aria-hidden="true">
            {meta.icon}
          </div>

          <div className="content">
            <div className="topline">
              <span className="from">
              {activeTab === "sent"
                ? (message.recipientName ?? message.to ?? message.recipientRole ?? "Recipient")
                : (message.senderName ?? message.from ?? "System")}
            </span>


              {!message.read && <span className="dot" title="Unread" />}

              {message.priority === "important" && (
                <span className="badge-important" title="Important">
                  Important
                </span>
              )}

              <span className={meta.chip}>{meta.label}</span>
            </div>

            <div className="title">{message.title}</div>

            {/* ✅ Preview becomes full text when open */}
            <div className={`preview ${isOpen ? "preview-expanded" : ""}`}>
              {message.message}
            </div>

            {/* Micro actions */}
            <div className="micro-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="micro-link"
                onClick={() => (isReplyOpen ? onCloseReply() : onOpenReply())}
              >
                Reply
              </button>

              <span className="micro-dot">·</span>

              <button
                type="button"
                className="micro-link"
                onClick={() => onToggleRead(message._id)}
              >
                {message.read ? "Mark Unread" : "Mark Read"}
              </button>

              <span className="micro-dot">·</span>

              <button
                type="button"
                className="micro-link danger"
                onClick={() => alert("Hardcoded: Trash action")}
              >
                Trash
              </button>
            </div>
          </div>
        </div>

        <div className="right">
          <div className="time">{formatDateTime(message.createdAt)}</div>
        </div>
      </div>

    {/* ✅ Inline expanded area (ONLY when open) */}
    {isOpen && (
      <div className="inbox-expand">
        {/* Reply input box */}
        {isReplyOpen && (
          <div className="reply-box">
            <div className="reply-head">
              <span className="replying-as">
                Replying as <strong>You</strong>
              </span>

              <button
                type="button"
                className="reply-x"
                onClick={onCloseReply}
                aria-label="Close reply"
              >
                ✕
              </button>
            </div>

            <textarea
              className="reply-textarea"
              rows={3}
              placeholder="Write a reply..."
              value={replyDraft}
              onChange={(e) => onChangeReply(e.target.value)}
            />

            <div className="reply-actions">
              <button className="btn btn-ghost btn-sm" onClick={onCloseReply}>
                Cancel
              </button>

              <button
                className="btn btn-soft btn-sm"
                onClick={onSendReply}
                disabled={!replyDraft?.trim()}
                title={!replyDraft?.trim() ? "Type something to send" : "Send"}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Threaded replies */}
        {Array.isArray(replies) && replies.length > 0 && (
          <div className="reply-thread">
            {replies.map((r) => (
              <div key={r.id} className="reply-bubble">
                <div className="reply-meta">
                  <span className="reply-from">{r.from}</span>
                  <span className="reply-at">{formatDateTime(r.at)}</span>
                </div>
                <div className="reply-text">{r.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    </div>
  );
};

export default MessageBox;
