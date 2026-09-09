import React from "react";

export default function RecentActivityTable({ rows }) {
  return (
    <section className="admin-activity-widget">
      <header><div><h2>Recent activity</h2><p>Latest applications and published events</p></div></header>
      <div className="admin-activity-table-wrap">
        <table className="admin-activity-table">
          <thead><tr><th>Activity</th><th>Category</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} style={{ "--row-index": index }}>
                <td><strong>{row.title}</strong><small>{row.detail}</small></td>
                <td>{row.category}</td>
                <td><span className={`admin-activity-status is-${row.tone}`}>{row.status}</span></td>
                <td>{row.date}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4" className="admin-empty-state">Activity will appear after the first registration or event.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
