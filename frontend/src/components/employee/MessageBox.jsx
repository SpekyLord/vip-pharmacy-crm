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
                onClick={() => onToggleRead(message._id)}
              >
                {message.read ? "Mark Unread" : "Mark Read"}
              </button>

            </div>
          </div>
        </div>

        <div className="right">
          <div className="time">{formatDateTime(message.createdAt)}</div>
        </div>
      </div>

    {/* Inline expanded area (ONLY when open) */}
    {isOpen && (
      <div className="inbox-expand">
      </div>
    )}

    </div>
  );
};

export default MessageBox;
