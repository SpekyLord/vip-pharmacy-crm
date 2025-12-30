/**
 * MessageBox Component
 *
 * Represents a single inbox message row with:
 * - Read / unread state
 * - Priority badge
 * - Expandable dropdown body
 * - Mark as read toggle
 *
 * NOTE:
 * - Data is passed from parent (InboxList / Page)
 * - No API calls here (keeps component reusable)
 */

const MessageBox = ({
  message,
  isOpen,
  onToggle,
  onToggleRead,
  formatDateTime,
  getTypeMeta,
}) => {
  const meta = getTypeMeta(message.category);

  return (
    <div className="inbox-row">
      {/* Main row */}
      <div
        className={`inbox-item ${message.read ? 'is-read' : 'is-unread'} ${
          isOpen ? 'is-selected' : ''
        }`}
        onClick={() => onToggle(message)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle(message)}
      >
        <div className="left">
          <div className="avatar" aria-hidden="true">
            {meta.icon}
          </div>

          <div className="content">
            <div className="topline">
              <span className="from">{message.senderName}</span>

              {!message.read && (
                <span className="dot" title="Unread" />
              )}

              {message.priority === 'important' && (
                <span className="badge-important" title="Important">
                  Important
                </span>
              )}

              <span className={meta.chip}>{meta.label}</span>
            </div>

            <div className="title">{message.title}</div>
            <div className="preview">{message.message}</div>
          </div>
        </div>

        <div className="right">
          <div className="time">
            {formatDateTime(message.createdAt)}
          </div>

          <button
            className="btn btn-link mini"
            onClick={(e) => {
              e.stopPropagation();
              onToggleRead(message._id);
            }}
            title={message.read ? 'Mark as unread' : 'Mark as read'}
          >
            {message.read ? 'Mark Unread' : 'Mark Read'}
          </button>
        </div>
      </div>

      {/* Dropdown body */}
      {isOpen && (
        <div
          className="inbox-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dropdown-meta">
            <span className="meta-item">
              <strong>From:</strong> {message.from}
            </span>
            <span className="meta-item">
              <strong>Date:</strong> {formatDateTime(message.createdAt)}
            </span>
            <span className="meta-item">
              <strong>Category:</strong> {meta.label}
            </span>
          </div>

          <p className="dropdown-body">{message.message}</p>

          <div className="dropdown-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onToggle(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageBox;
