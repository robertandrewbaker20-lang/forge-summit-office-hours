export type HostType = "Partner" | "Cohort";
export type SlotStatus = "Open" | "Booked" | "Blocked";

export type Agency = {
  id: number;
  name: string;
  type: HostType;
  blurb: string;
  location: string;
  website: string;
  repName: string;
  repEmails: string;
  calendarId: string;
  active: boolean;
};

export type Slot = {
  id: string;
  agencyId: number;
  agencyName: string;
  startAt: string;
  endAt: string;
  timeLabel: string;
  dayLabel: string;
  status: SlotStatus;
  attendeeName: string | null;
  attendeeEmail: string | null;
  organization: string | null;
  topic: string | null;
  bookedAt: string | null;
  confirmation: string | null;
  calendarEventId: string | null;
};

export type EventInfo = {
  name: string;
  tagline: string;
  location: string;
  room: string;
  logo: string;
};

export type AvailabilitySlot = {
  id: string;
  day: string;
  time: string;
  open: boolean;
};

export type AvailabilityAgency = {
  name: string;
  type: HostType;
  blurb: string;
  location: string;
  website: string;
  rep: string;
  logo: string | null;
  open: number;
  slots: AvailabilitySlot[];
};

export type Availability = {
  open: boolean;
  total: number;
  days: string[];
  agencies: AvailabilityAgency[];
  event: EventInfo;
};

export type BookSlotInput = {
  slotId: string;
  name: string;
  email: string;
  org?: string;
  topic?: string;
};

export type BookSlotSuccess = {
  ok: true;
  confirmation: string;
  agency: string;
  day: string;
  time: string;
  room: string;
};

export type BookSlotFailure = {
  ok: false;
  code: "CLOSED" | "INVALID" | "TAKEN" | "LIMIT" | "ERROR";
  limit?: number;
};

export type BookSlotResult = BookSlotSuccess | BookSlotFailure;

export type BoardCellStatus = SlotStatus;

export type BoardAgency = {
  name: string;
  type: HostType;
  cells: Record<string, BoardCellStatus>;
};

export type Board = {
  hasToday: boolean;
  times: string[];
  agencies: BoardAgency[];
  room: string;
  event: string;
  updated: string;
};

export type OpsBooking = {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  organization: string;
  topic: string;
  hostName: string;
  hostType: HostType;
  day: string;
  time: string;
  confirmation: string;
  bookedAt: string | null;
};
