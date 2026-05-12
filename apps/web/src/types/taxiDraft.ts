export interface TaxiRosterEntry {
  playerId: string;
  teamId: string;
  addedAt: string;
  pickNumber?: number;
}

export interface TaxiRosters {
  [teamId: string]: TaxiRosterEntry[];
}

export interface TaxiDraftState {
  taxiDraftOrder: string[];
  taxiRosters: TaxiRosters;
}
