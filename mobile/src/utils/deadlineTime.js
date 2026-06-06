export function createTodayDeadlineIso(timeText) {
  const [hoursText, minutesText] = String(timeText).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const deadline = new Date();
  deadline.setHours(Number.isFinite(hours) ? hours : 15);
  deadline.setMinutes(Number.isFinite(minutes) ? minutes : 30);
  deadline.setSeconds(0);
  deadline.setMilliseconds(0);

  if (deadline.getTime() <= Date.now()) {
    deadline.setDate(deadline.getDate() + 1);
  }

  return deadline.toISOString();
}

export function createDeadlineIsoFromInput(inputText) {
  const text = String(inputText ?? "").trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*(\u4e0a\u5348|\u4e0b\u5348|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
  if (!match) {
    return createTodayDeadlineIso(text);
  }

  const [, yearText, monthText, dayText, meridiemText, hourText, minuteText, secondText] = match;
  let hours = Number(hourText);
  const meridiem = meridiemText?.toUpperCase();
  if ((meridiem === "\u4e0b\u5348" || meridiem === "PM") && hours < 12) hours += 12;
  if ((meridiem === "\u4e0a\u5348" || meridiem === "AM") && hours === 12) hours = 0;

  const deadline = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    hours,
    Number(minuteText),
    Number(secondText ?? 0),
    0
  );

  if (Number.isNaN(deadline.getTime())) {
    return createTodayDeadlineIso(text);
  }

  return deadline.toISOString();
}

export function getDefaultDeadlineInput(minutesFromNow = 90) {
  return formatDateTimeInput(new Date(Date.now() + minutesFromNow * 60000));
}

export function formatDeadlineLabel(deadlineAt) {
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) return String(deadlineAt ?? "");
  return formatDateTimeInput(date);
}

export function formatDateTimeInput(date) {
  const hours24 = date.getHours();
  const meridiem = hours24 >= 12 ? "\u4e0b\u5348" : "\u4e0a\u5348";
  const hours12 = hours24 % 12 || 12;
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${meridiem} ${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getMinutesUntilDeadline(deal, now = new Date()) {
  const deadlineAt = deal?.deadlineAt ?? deal?.endTime;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return deal?.minutesUntilDeadline ?? null;
  }

  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 60000));
}

export function isDeadlineReached(deal, now = new Date()) {
  const minutes = getMinutesUntilDeadline(deal, now);
  return minutes != null && minutes <= 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
