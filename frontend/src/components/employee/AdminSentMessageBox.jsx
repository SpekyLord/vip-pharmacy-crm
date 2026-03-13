/**
 * AdminSentMessageBox Component
 *
 * For ADMIN "Sent" tab only.
 * - Clean row UI
 * - Toggle message body (Message button) ✅ mimic Inbox "Reply" behavior, label = "Message"
 * - Edit mode (inline) ✅ stays the same
 * - Delete button (optional, callback-based)
 *
 * NOTE:
 * - No API calls here.
 * - Parent handles saving/updating/deleting.
 */

import { useEffect, useMemo, useState } from "react";

const AdminSentMessageBox = ({
  message,
  isOpen,

  // ✅ keep edit system the same (parent-controlled)
  isEditing,
  onToggleOpen,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,

  onDelete,
  formatDateTime,
  getTypeMeta,
}) => {
  const meta = getTypeMeta?.(message?.category) ?? {
    label: "Notice",
    chip: "chip",
    icon: "✉️",
  };

  // ----------------------------
  // ✅ "Message" composer (mimic Inbox Reply feature)
  // ----------------------------
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messagesById, setMessagesById] = useState({}); // local-only "sent followups" list (hardcoded)

  const openMessageComposer = () => {
    // ensure expanded row is open (same as inbox openReply calling setExpandedId)
    if (!isOpen) onToggleOpen?.();
    setMessageOpen(true);
  };

  const closeMessageComposer = () => {
    setMessageOpen(false);
    setMessageDraft("");
  };

  const sendMessage = () => {
    const text = (messageDraft ?? "").trim();
    if (!text) return;

    const id = message?._id ?? "unknown";

    const newMsg = {
      id: `${id}-${Date.now()}`,
      text,
      at: new Date().toISOString(),
      from: "You",
    };

    setMessagesById((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []), newMsg],
    }));

    setMessageDraft("");
    setMessageOpen(false);
  };

  const sentFollowups = useMemo(() => {
    const id = message?._id ?? "unknown";
    return messagesById[id] ?? [];
  }, [messagesById, message?._id]);

  // ----------------------------
  // ✅ Edit draft (same as your previous edit system)
  // ----------------------------
  const [draftTitle, setDraftTitle] = useState(message?.title ?? "");
  const [draftBody, setDraftBody] = useState(message?.body ?? message?.message ?? "");
  const [draftCategory, setDraftCategory] = useState(message?.category ?? "system");
  const [draftPriority, setDraftPriority] = useState(message?.priority ?? "normal");
  const [draftRecipientRole, setDraftRecipientRole] = useState(message?.recipientRole ?? "employee");

  // when switching messages or edit mode, reset draft + reset local composer
  useEffect(() => {
    setDraftTitle(message?.title ?? "");
    setDraftBody(message?.body ?? message?.message ?? "");
    setDraftCategory(message?.category ?? "system");
    setDraftPriority(message?.priority ?? "normal");
    setDraftRecipientRole(message?.recipientRole ?? "employee");

    // ✅ mimic inbox: switching message closes reply box
    setMessageOpen(false);
    setMessageDraft("");
  }, [message?._id, isEditing]);

  return (
    <div className={`inbox-row ${isOpen ? "is-open" : ""}`}>
      {/* Main row */}
      <div
        className={`inbox-item ${isOpen ? "is-unread" : "is-read"}`}
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggleOpen?.()}
      >
        <div className="left">
          <div className="avatar" aria-hidden="true">
            {meta.icon}
          </div>

          <div className="content">
            <div className="topline">
              <span className="to">
                To: <strong>{message?.recipientRole ?? "Recipient"}</strong>
              </span>

              {message?.priority === "important" && (
                <span className="badge-important" title="Important">
                  Important
                </span>
              )}

              <span className={meta.chip}>{meta.label}</span>
            </div>

            <div className="title">{message?.title}</div>

            <div className={`preview ${isOpen ? "preview-expanded" : ""}`}>

            {message?.body ?? message?.message}
            </div>



            {/* Actions */}
            <div className="micro-actions" onClick={(e) => e.stopPropagation()}>
              {/* ✅ Message button (mimic inbox Reply button) */}
              <button
                type="button"
                className="micro-link"
                onClick={() => {
                  // same behavior: open composer if closed, otherwise toggle
                  if (!messageOpen) openMessageComposer();
                  else setMessageOpen(false);
                }}
              >
                {messageOpen ? "Hide" : "Message"}
              </button>

              <span className="micro-dot">·</span>

              {/* ✅ Edit system stays the same */}
              {!isEditing ? (
                <button type="button" className="micro-link" onClick={onStartEdit}>
                  Edit
                </button>
              ) : (
                <button type="button" className="micro-link" onClick={onCancelEdit}>
                  Cancel
                </button>
              )}

              {onDelete && (
                <>
                  <span className="micro-dot">·</span>
                  <button type="button" className="micro-link danger" onClick={onDelete}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="right">
          <div className="time">{formatDateTime?.(message?.createdAt)}</div>
        </div>
      </div>

      {/* Expanded section */}
        {isOpen && (
        <div className="inbox-expand" onClick={(e) => e.stopPropagation()}>

       

          {/* ✅ Message composer (mimic inbox Reply dropdown UI) */}
          {messageOpen && !isEditing && (
            <div className="reply-box">
              {/* local history (optional, mimic replies list) */}
            {sentFollowups.length > 0 && (
            <div className="reply-thread">
                {sentFollowups.map((r) => (
                <div key={r.id} className="reply-bubble">

                      <div className="reply-meta">
                        <strong>{r.from}</strong>
                        <span className="reply-time">{formatDateTime?.(r.at)}</span>
                      </div>
                      <div className="reply-text">{r.text}</div>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                rows={3}
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="Write the message..."
              />

              <div className="reply-actions">
                <button className="btn btn-secondary btn-sm" onClick={closeMessageComposer}>
                  Cancel
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={sendMessage}
                  disabled={!messageDraft.trim()}
                  title={!messageDraft.trim() ? "Message is required" : "Send"}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* ✅ Edit box (unchanged behavior) */}
          {isEditing && (
            <div className="edit-box">
              <div className="edit-grid">
                <div className="edit-field">
                  <label>Title</label>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="Message title"
                  />
                </div>

                <div className="edit-field">
                  <label>Category</label>
                  <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)}>
                    <option value="announcement">Announcement</option>
                    <option value="payroll">Payroll</option>
                    <option value="leave">Leave</option>
                    <option value="policy">Policy</option>
                    <option value="system">System</option>
                    <option value="compliance_alert">Compliance Alert</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="edit-field">
                  <label>Priority</label>
                  <select value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="edit-field">
                  <label>Recipient Role</label>
                  <select
                    value={draftRecipientRole}
                    onChange={(e) => setDraftRecipientRole(e.target.value)}
                  >
                    <option value="employee">BDM</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="edit-field full">
                  <label>Body</label>
                  <textarea
                    rows={4}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write the message..."
                  />
                </div>
              </div>

              <div className="edit-actions">
                <button className="btn btn-secondary btn-sm" onClick={onCancelEdit}>
                  Cancel
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    onSaveEdit?.({
                      title: draftTitle.trim(),
                      body: draftBody.trim(),
                      category: draftCategory,
                      priority: draftPriority,
                      recipientRole: draftRecipientRole,
                    })
                  }
                  disabled={!draftTitle.trim() || !draftBody.trim()}
                  title={
                    !draftTitle.trim() || !draftBody.trim()
                      ? "Title and body are required"
                      : "Save changes"
                  }
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Component-local styles (safe) */}
      <style>{`
       
       
        .left{ display:flex; gap:12px; flex:1; min-width:0; }
        .avatar{ width:34px; height:34px; display:grid; place-items:center; border-radius:10px; background:#f3f4f6; }
        .content{ flex:1; min-width:0; }
        .topline{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:.85rem; color:#374151; }
        .to{ font-weight:700; }
        .title{ margin-top:4px; font-weight:900; color:#111827; }
        .preview{ margin-top:6px; color:#4b5563; font-size:.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .preview.preview-expanded{ white-space:normal; }
        .time{ font-size:.8rem; color:#6b7280; white-space:nowrap; }

        .micro-actions{ margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .micro-link{ background:transparent; border:1px solid #e5e7eb; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:700; }
        .micro-link:hover{ background:#f9fafb; }
        .micro-link.danger{ border-color:#fecaca; color:#b91c1c; }
        .micro-dot{ color:#9ca3af; }

        .badge-important{
          background:#fef3c7; color:#92400e; border:1px solid #fde68a;
          padding:2px 8px; border-radius:999px; font-weight:800; font-size:.75rem;
        }

        /* chips */
        .chip{
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 8px; border-radius:999px; font-size:.75rem; font-weight:800;
          border:1px solid #e5e7eb; color:#374151; background:#f9fafb;
        }
        .chip-blue{ background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
        .chip-purple{ background:#f5f3ff; border-color:#ddd6fe; color:#6d28d9; }
        .chip-green{ background:#ecfdf5; border-color:#a7f3d0; color:#047857; }
        .chip-orange{ background:#fff7ed; border-color:#fed7aa; color:#c2410c; }
        .chip-red{ background:#fef2f2; border-color:#fecaca; color:#b91c1c; }

        .sent-expand{
          margin-top:10px;
          background:#fff;
          border:1px dashed #e5e7eb;
          border-radius:12px;
          padding:12px;
        }
        .sent-body-text{ margin:0; color:#374151; line-height:1.5; }

        /* ✅ Reply-style (Message) composer styles */
        .reply-box{ margin-top:12px; display:flex; flex-direction:column; gap:10px; }
        .reply-box textarea{
          border:1px solid #e5e7eb; border-radius:10px; padding:10px; font-size:.9rem;
          outline:none; resize:vertical;
        }
        .reply-actions{ display:flex; justify-content:flex-end; gap:10px; }

        .reply-thread{
        margin-top:14px;

        /* 🔹 LEFT INDENT */
        padding-left:26px;

        /* 🔹 VERTICAL BAR */
        border-left:3px solid #e5e7eb;

        display:flex;
        flex-direction:column;
        gap:12px;
        }

        .reply-bubble{
        margin-left:2px; /* subtle offset from bar */
        border:1ading  #e5e7eb;
        border-radius:14px;
        padding:12px;
        background:#ffffff;
        box-shadow:0 6px 14px rgba(17,24,39,.04);
        }

        .reply-meta{
            display:flex;
            justify-content:space-between;
            align-items:center;

            font-size:.75rem;
            font-weight:700;
            color:#64748b;
            }

        .reply-time{ white-space:nowrap; }
        .reply-text{ margin-top:6px; color:#111827; font-size:.9rem; white-space:pre-wrap; }

        .edit-box{ display:flex; flex-direction:column; gap:12px; margin-top:12px; }
        .edit-grid{
          display:grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap:10px;
        }
        .edit-field{ display:flex; flex-direction:column; gap:6px; }
        .edit-field.full{ grid-column:1 / -1; }
        .edit-field label{ font-size:.75rem; font-weight:800; color:#6b7280; }
        .edit-field input,.edit-field select,.edit-field textarea{
          border:1px solid #e5e7eb; border-radius:10px; padding:10px; font-size:.9rem;
          outline:none;
        }
        .edit-field textarea{ resize:vertical; }
        .edit-actions{ display:flex; justify-content:flex-end; gap:10px; }
      `}</style>
    </div>
  );
};

export default AdminSentMessageBox;
