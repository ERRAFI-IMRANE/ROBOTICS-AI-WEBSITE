import React, { useState, useEffect } from "react";
import "./AdminDashboard.css";

// Hook for instrument power-on count-up animation on data readouts
function useCountUp(targetNumber, duration = 750) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const end = Number(targetNumber) || 0;
    if (end === 0) {
      setCount(0);
      return;
    }

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      setCount(Math.floor(ease * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    window.requestAnimationFrame(step);
  }, [targetNumber, duration]);

  return count;
}

export default function AdminAnalytics({ eventsCount = 12, membersCount = 118 }) {
  const [selectedDept, setSelectedDept] = useState("all");

  // Animated instrument readouts
  const animatedMembers = useCountUp(membersCount || 118);
  const animatedProjects = useCountUp(8);
  const animatedInventory = useCountUp(342);
  const animatedBudget = useCountUp(4850);

  // Active engineering projects list
  const activeProjects = [
    {
      id: "PRJ-01",
      name: "Autonomous Rover V4",
      subsystem: "Computer Vision & Navigation",
      lead: "Imrane Errafi",
      status: "Active",
      statusType: "positive",
      budget: "$1,200",
      deadline: "15 Apr 2025",
    },
    {
      id: "PRJ-02",
      name: "ROS2 Quadcopter Autopilot",
      subsystem: "Flight Controller (PX4)",
      lead: "Aya Mansouri",
      status: "Active",
      statusType: "positive",
      budget: "$850",
      deadline: "28 Mar 2025",
    },
    {
      id: "PRJ-03",
      name: "Smart Agriculture Robot",
      subsystem: "Soil Sensing & AI Edge",
      lead: "Mehdi Alami",
      status: "Planning",
      statusType: "warning",
      budget: "$620",
      deadline: "10 May 2025",
    },
    {
      id: "PRJ-04",
      name: "Bipedal Walker Platform",
      subsystem: "Servo Dynamics & Inverse Kinematics",
      lead: "Yassine Berrada",
      status: "Blocked",
      statusType: "critical",
      budget: "$1,450",
      deadline: "02 Jun 2025",
    },
  ];

  // Engineering departments distribution
  const departments = [
    { name: "Génie Informatique & AI", count: 52, percentage: "44.1%" },
    { name: "Génie Électrique (GIME)", count: 36, percentage: "30.5%" },
    { name: "Génie Industriel & Maintenance", count: 20, percentage: "16.9%" },
    { name: "Techniques de Management", count: 10, percentage: "8.5%" },
  ];

  return (
    <div className="admin-tab-content">
      {/* Page Header */}
      <div className="admin-view-header">
        <div>
          <h1 className="admin-page-title">System overview</h1>
          <p className="admin-page-desc">
            Operational status, lab telemetry, and active project workflows.
          </p>
        </div>

        <div className="admin-header-actions">
          <div className="status-chip status-chip-positive">
            <span className="status-chip-dot" />
            <span>Telemetry online</span>
          </div>
        </div>
      </div>

      {/* Signature Targeting Bracket Panel (THE ONLY ONE IN THE ENTIRE DASHBOARD) */}
      <div className="signature-hero-panel">
        <div className="bracket-corner bracket-top-left" aria-hidden="true" />
        <div className="bracket-corner bracket-top-right" aria-hidden="true" />
        <div className="bracket-corner bracket-bottom-left" aria-hidden="true" />
        <div className="bracket-corner bracket-bottom-right" aria-hidden="true" />

        <div className="hero-panel-grid">
          <div className="hero-panel-main">
            <span className="hero-panel-tag">Signature Milestone</span>
            <h2 className="hero-panel-title">National Robotics Hackathon 2025</h2>
            <p className="hero-panel-desc">
              48-hour continuous hardware and embedded AI challenge at EST Safi campus. Primary rover calibration and firmware flashing in progress.
            </p>
          </div>

          <div className="hero-countdown-readout">
            <div className="countdown-unit">
              <span className="countdown-num">50</span>
              <span className="countdown-label">Days to deploy</span>
            </div>
            <div className="countdown-unit">
              <span className="countdown-num">04</span>
              <span className="countdown-label">Teams registered</span>
            </div>
            <div className="countdown-unit">
              <span className="countdown-num">12</span>
              <span className="countdown-label">Hardware benches</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Instruments Grid (Data readouts only in Mono) */}
      <div className="data-metrics-grid">
        {/* Metric 1 */}
        <div className="data-metric-panel">
          <div className="metric-label-row">
            <span className="metric-label">Registered members</span>
            <span className="status-chip status-chip-positive">Active</span>
          </div>
          <div className="metric-readout-row">
            <span className="metric-readout">{animatedMembers}</span>
            <span className="metric-delta delta-positive">+14 this season</span>
          </div>
          <span className="metric-subtext">Students & faculty advisors across 4 departments</span>
        </div>

        {/* Metric 2 */}
        <div className="data-metric-panel">
          <div className="metric-label-row">
            <span className="metric-label">Active projects</span>
            <span className="status-chip status-chip-neutral">In build</span>
          </div>
          <div className="metric-readout-row">
            <span className="metric-readout">{animatedProjects}</span>
            <span className="metric-delta delta-positive">2 near completion</span>
          </div>
          <span className="metric-subtext">Robotics, computer vision, and drone platforms</span>
        </div>

        {/* Metric 3 */}
        <div className="data-metric-panel">
          <div className="metric-label-row">
            <span className="metric-label">Inventory components</span>
            <span className="status-chip status-chip-warning">Stocked</span>
          </div>
          <div className="metric-readout-row">
            <span className="metric-readout">{animatedInventory}</span>
            <span className="metric-delta delta-warning">18 low stock</span>
          </div>
          <span className="metric-subtext">Microcontrollers, actuators, lidar, sensors</span>
        </div>

        {/* Metric 4 */}
        <div className="data-metric-panel">
          <div className="metric-label-row">
            <span className="metric-label">Equipment budget</span>
            <span className="status-chip status-chip-positive">Funded</span>
          </div>
          <div className="metric-readout-row">
            <span className="metric-readout">${animatedBudget.toLocaleString()}</span>
            <span className="metric-delta delta-positive">68% allocated</span>
          </div>
          <span className="metric-subtext">University grants and external partner sponsorships</span>
        </div>
      </div>

      {/* Main Content Row: Active Projects Table + Department Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "16px" }}>
        {/* Active Projects Table */}
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3 className="admin-panel-heading">Active hardware & AI projects</h3>
              <p className="admin-panel-meta">Track technical progress and subsystem status</p>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }}>
              Export report
            </button>
          </div>

          <div className="table-container">
            <table className="hairline-table">
              <thead>
                <tr>
                  <th>Project ID</th>
                  <th>System</th>
                  <th>Status</th>
                  <th className="col-numeric">Budget</th>
                  <th>Target date</th>
                </tr>
              </thead>
              <tbody>
                {activeProjects.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" }}>
                      {p.id}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{p.subsystem}</div>
                    </td>
                    <td>
                      <span className={`status-chip status-chip-${p.statusType}`}>
                        <span className="status-chip-dot" />
                        <span>{p.status}</span>
                      </span>
                    </td>
                    <td className="col-numeric">{p.budget}</td>
                    <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{p.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Department Distribution */}
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3 className="admin-panel-heading">Department breakdown</h3>
              <p className="admin-panel-meta">Student distribution by engineering discipline</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "4px" }}>
            {departments.map((d) => (
              <div key={d.name} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span>{d.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {d.count} ({d.percentage})
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: d.percentage,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border)",
              fontSize: "12px",
              color: "var(--text-muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Total enrolled members</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text)" }}>118 students</span>
          </div>
        </div>
      </div>
    </div>
  );
}
