export function ProgressCard({ currentCups, targetCups, participantCount, remainingTimeText }) {
  const percentage = Math.min(Math.round((currentCups / targetCups) * 100), 100);
  return (
    <div className="progress-card">
      <div className="progress-header">
        <strong>{currentCups} / {targetCups} ??/strong>
        {participantCount !== undefined && <span>{participantCount} 鈭箏???/span>}
      </div>
      <div className="progress-track"><div style={{ width: `${percentage}%` }} /></div>
      <span className="subtle">?拚???嚗remainingTimeText}</span>
    </div>
  );
}
