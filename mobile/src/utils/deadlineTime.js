import { getBusinessNow } from "./businessTime";

export function createTodayDeadlineIso(timeText) {
  const [hoursText, minutesText] = String(timeText).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const deadline = getBusinessNow();
  deadline.setHours(Number.isFinite(hours) ? hours : 15);
  deadline.setMinutes(Number.isFinite(minutes) ? minutes : 30);
  deadline.setSeconds(0);
  deadline.setMilliseconds(0);

  if (deadline.getTime() <= getBusinessNow().getTime()) {
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
  return formatDateTimeInput(new Date(getBusinessNow().getTime() + minutesFromNow * 60000));
}

export function formatDeadlineLabel(deadlineAt) {
  const date = new Date(deadlineAt);
  if (Number.isNaN(date.getTime())) return String(deadlineAt ?? "");
  return formatDateTimeInput(date);
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

// Pickup start/end usually share a calendar day (the window is a fixed 3 hours, see
// backend/pickup/pickupWindow.js), so the date is normally shown once instead of repeating it
// for both ends like formatDeadlineLabel would. But stores without a configured closing time
// have no cap on how late pickupStartAt can be, so the 3-hour window can cross midnight --
// show both dates in that case instead of implying the end time is on the same day.
export function formatPickupTimeRangeLabel(pickupStartAt, pickupEndAt) {
  const start = new Date(pickupStartAt);
  const end = new Date(pickupEndAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [pickupStartAt, pickupEndAt].filter(Boolean).join(" - ");
  }
  const startDatePart = `${pad(start.getMonth() + 1)}/${pad(start.getDate())}（${WEEKDAY_LABELS[start.getDay()]}）`;
  if (isSameCalendarDay(start, end)) {
    return `${startDatePart} ${formatTimeOfDay(start)} - ${formatTimeOfDay(end)}`;
  }
  const endDatePart = `${pad(end.getMonth() + 1)}/${pad(end.getDate())}（${WEEKDAY_LABELS[end.getDay()]}）`;
  return `${startDatePart} ${formatTimeOfDay(start)} - ${endDatePart} ${formatTimeOfDay(end)}`;
}

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatTimeOfDay(date) {
  const hours24 = date.getHours();
  const meridiem = hours24 >= 12 ? "下午" : "上午";
  const hours12 = hours24 % 12 || 12;
  return `${meridiem}${pad(hours12)}:${pad(date.getMinutes())}`;
}

export function formatDateTimeInput(date) {
  const hours24 = date.getHours();
  const meridiem = hours24 >= 12 ? "\u4e0b\u5348" : "\u4e0a\u5348";
  const hours12 = hours24 % 12 || 12;
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${meridiem} ${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getMinutesUntilDeadline(groupBuyActivity, now = getBusinessNow()) {
  const deadlineAt = groupBuyActivity?.deadlineAt ?? groupBuyActivity?.endTime;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    return groupBuyActivity?.minutesUntilDeadline ?? null;
  }

  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 60000));
}

export function isDeadlineReached(groupBuyActivity, now = getBusinessNow()) {
  const minutes = getMinutesUntilDeadline(groupBuyActivity, now);
  return minutes != null && minutes <= 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
