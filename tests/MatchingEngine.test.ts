import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Location {
  lat: number;
  long: number;
}

interface Request {
  urgency: number;
  quantity: number;
  location: Location;
  itemType: string;
  emergencyId: number;
}

interface Inventory {
  quantity: number;
  location: Location;
  itemType: string;
  supplier: string;
}

interface Match {
  supplier: string;
  requester: string;
  quantityMatched: number;
  score: number;
  status: string;
  timestamp: number;
  expiry: number;
}

interface Score {
  score: number;
  calculatedAt: number;
}

interface ContractState {
  matches: Map<string, Match>; // Key: `${requestId}-${inventoryId}`
  requestMatches: Map<number, { matchCount: number }>;
  scores: Map<string, Score>; // Key: `${requestId}-${inventoryId}`
  requests: Map<number, Request>; // Simulated dependency
  inventories: Map<number, Inventory>; // Simulated dependency
  emergencies: Map<number, boolean>; // Simulated active emergencies
  paused: boolean;
  admin: string;
  totalMatches: number;
  blockHeight: number; // Simulated block height
}

// Mock contract implementation
class MatchingEngineMock {
  private state: ContractState = {
    matches: new Map(),
    requestMatches: new Map(),
    scores: new Map(),
    requests: new Map(),
    inventories: new Map(),
    emergencies: new Map(),
    paused: false,
    admin: "deployer",
    totalMatches: 0,
    blockHeight: 1000,
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_REQUEST_NOT_FOUND = 101;
  private ERR_INVENTORY_NOT_FOUND = 102;
  private ERR_INVALID_MATCH = 103;
  private ERR_MATCH_ALREADY_EXISTS = 104;
  private ERR_MAX_MATCHES_REACHED = 114;
  private ERR_EMERGENCY_NOT_ACTIVE = 112;
  private ERR_CONTRACT_PAUSED = 108;
  private ERR_INVALID_SCORE = 109;
  private ERR_INVALID_TIMESTAMP = 115;
  private ERR_MATCH_NOT_CONFIRMED = 111;

  private MAX_MATCHES_PER_REQUEST = 10;
  private MIN_URGENCY_SCORE = 50;
  private LOCATION_COMPATIBILITY_RADIUS = 100;
  private SCORE_WEIGHT_URGENCY = 60;
  private SCORE_WEIGHT_QUANTITY = 20;
  private SCORE_WEIGHT_LOCATION = 20;

  // Helper to get map key
  private getKey(requestId: number, inventoryId: number): string {
    return `${requestId}-${inventoryId}`;
  }

  // Simulated block height increment
  private incrementBlockHeight() {
    this.state.blockHeight += 1;
  }

  // Private helpers (mirroring Clarity)
  private isAuthorizedCaller(caller: string): boolean {
    return caller === this.state.admin;
  }

  private calculateDistance(loc1: Location, loc2: Location): number {
    const deltaLat = loc1.lat - loc2.lat;
    const deltaLong = loc1.long - loc2.long;
    return deltaLat * deltaLat + deltaLong * deltaLong; // Squared
  }

  private isLocationCompatible(loc1: Location, loc2: Location): boolean {
    return this.calculateDistance(loc1, loc2) <= this.LOCATION_COMPATIBILITY_RADIUS * this.LOCATION_COMPATIBILITY_RADIUS;
  }

  private computeMatchScore(urgency: number, reqQuantity: number, invQuantity: number, distance: number): number {
    const urgencyScore = urgency * this.SCORE_WEIGHT_URGENCY;
    const quantityScore = (invQuantity >= reqQuantity ? 100 : (invQuantity / reqQuantity) * 100) * this.SCORE_WEIGHT_QUANTITY;
    const locationScore = (100 - (distance / this.LOCATION_COMPATIBILITY_RADIUS)) * this.SCORE_WEIGHT_LOCATION;
    return Math.floor((urgencyScore + quantityScore + locationScore) / 100);
  }

  private validateMatch(request: Request, inventory: Inventory): boolean {
    return (
      request.itemType === inventory.itemType &&
      inventory.quantity >= request.quantity &&
      this.isLocationCompatible(request.location, inventory.location) &&
      request.urgency >= this.MIN_URGENCY_SCORE
    );
  }

  // Public functions
  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  matchRequest(caller: string, requestId: number, inventoryId: number): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    if (!this.isAuthorizedCaller(caller)) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    const request = this.state.requests.get(requestId);
    if (!request) {
      return { ok: false, value: this.ERR_REQUEST_NOT_FOUND };
    }
    const inventory = this.state.inventories.get(inventoryId);
    if (!inventory) {
      return { ok: false, value: this.ERR_INVENTORY_NOT_FOUND };
    }
    const emergencyActive = this.state.emergencies.get(request.emergencyId) ?? false;
    if (!emergencyActive) {
      return { ok: false, value: this.ERR_EMERGENCY_NOT_ACTIVE };
    }
    const key = this.getKey(requestId, inventoryId);
    if (this.state.matches.has(key)) {
      return { ok: false, value: this.ERR_MATCH_ALREADY_EXISTS };
    }
    const requestMatches = this.state.requestMatches.get(requestId) ?? { matchCount: 0 };
    if (requestMatches.matchCount >= this.MAX_MATCHES_PER_REQUEST) {
      return { ok: false, value: this.ERR_MAX_MATCHES_REACHED };
    }
    if (!this.validateMatch(request, inventory)) {
      return { ok: false, value: this.ERR_INVALID_MATCH };
    }
    const distance = this.calculateDistance(request.location, inventory.location);
    const score = this.computeMatchScore(request.urgency, request.quantity, inventory.quantity, distance);
    if (score < this.MIN_URGENCY_SCORE) {
      return { ok: false, value: this.ERR_INVALID_SCORE };
    }
    this.state.scores.set(key, { score, calculatedAt: this.state.blockHeight });
    this.state.matches.set(key, {
      supplier: inventory.supplier,
      requester: caller,
      quantityMatched: request.quantity,
      score,
      status: "pending",
      timestamp: this.state.blockHeight,
      expiry: this.state.blockHeight + 100,
    });
    this.state.requestMatches.set(requestId, { matchCount: requestMatches.matchCount + 1 });
    this.state.totalMatches += 1;
    this.incrementBlockHeight();
    return { ok: true, value: score };
  }

  confirmMatch(caller: string, requestId: number, inventoryId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const key = this.getKey(requestId, inventoryId);
    const match = this.state.matches.get(key);
    if (!match) {
      return { ok: false, value: this.ERR_REQUEST_NOT_FOUND }; // Using request not found as proxy
    }
    if (match.status !== "pending") {
      return { ok: false, value: this.ERR_MATCH_NOT_CONFIRMED };
    }
    if (caller !== match.requester) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (this.state.blockHeight > match.expiry) {
      return { ok: false, value: this.ERR_INVALID_TIMESTAMP };
    }
    const inventory = this.state.inventories.get(inventoryId)!;
    if (inventory.quantity < match.quantityMatched) {
      return { ok: false, value: 105 }; // ERR_INSUFFICIENT_QUANTITY
    }
    inventory.quantity -= match.quantityMatched;
    match.status = "confirmed";
    this.state.matches.set(key, match);
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  cancelMatch(caller: string, requestId: number, inventoryId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const key = this.getKey(requestId, inventoryId);
    const match = this.state.matches.get(key);
    if (!match) {
      return { ok: false, value: this.ERR_REQUEST_NOT_FOUND };
    }
    if (match.status !== "pending") {
      return { ok: false, value: this.ERR_MATCH_NOT_CONFIRMED };
    }
    if (caller !== match.requester && caller !== match.supplier) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    this.state.matches.delete(key);
    this.state.scores.delete(key);
    const requestMatches = this.state.requestMatches.get(requestId)!;
    requestMatches.matchCount -= 1;
    this.state.totalMatches -= 1;
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  getMatchDetails(requestId: number, inventoryId: number): ClarityResponse<Match | null> {
    return { ok: true, value: this.state.matches.get(this.getKey(requestId, inventoryId)) ?? null };
  }

  getScore(requestId: number, inventoryId: number): ClarityResponse<Score | null> {
    return { ok: true, value: this.state.scores.get(this.getKey(requestId, inventoryId)) ?? null };
  }

  getTotalMatches(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalMatches };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getRequestMatchCount(requestId: number): ClarityResponse<number> {
    return { ok: true, value: (this.state.requestMatches.get(requestId)?.matchCount ?? 0) };
  }

  // Simulated setters for testing dependencies
  addRequest(id: number, request: Request) {
    this.state.requests.set(id, request);
  }

  addInventory(id: number, inventory: Inventory) {
    this.state.inventories.set(id, inventory);
  }

  setEmergencyActive(id: number, active: boolean) {
    this.state.emergencies.set(id, active);
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  requester: "wallet_1",
  supplier: "wallet_2",
  unauthorized: "wallet_3",
};

describe("MatchingEngine Contract", () => {
  let contract: MatchingEngineMock;

  beforeEach(() => {
    contract = new MatchingEngineMock();
    vi.resetAllMocks();

    // Setup test data
    contract.addRequest(1, {
      urgency: 80,
      quantity: 100,
      location: { lat: 0, long: 0 },
      itemType: "food",
      emergencyId: 1,
    });
    contract.addInventory(1, {
      quantity: 200,
      location: { lat: 10, long: 10 },
      itemType: "food",
      supplier: accounts.supplier,
    });
    contract.setEmergencyActive(1, true);
  });

  it("should initialize correctly", () => {
    expect(contract.getAdmin()).toEqual({ ok: true, value: "deployer" });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
    expect(contract.getTotalMatches()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to pause and unpause contract", () => {
    const pause = contract.pauseContract(accounts.deployer);
    expect(pause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const matchDuringPause = contract.matchRequest(accounts.deployer, 1, 1);
    expect(matchDuringPause).toEqual({ ok: false, value: 108 });

    const unpause = contract.unpauseContract(accounts.deployer);
    expect(unpause).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const pause = contract.pauseContract(accounts.unauthorized);
    expect(pause).toEqual({ ok: false, value: 100 });
  });

  it("should create a valid match", () => {
    const match = contract.matchRequest(accounts.deployer, 1, 1);
    expect(match.ok).toBe(true);
    expect(match.value).toBeGreaterThan(50); // Score check

    const details = contract.getMatchDetails(1, 1);
    expect(details).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "pending",
        quantityMatched: 100,
        supplier: accounts.supplier,
        requester: accounts.deployer,
      }),
    });

    expect(contract.getTotalMatches()).toEqual({ ok: true, value: 1 });
    expect(contract.getRequestMatchCount(1)).toEqual({ ok: true, value: 1 });
  });

  it("should prevent match if emergency not active", () => {
    contract.setEmergencyActive(1, false);
    const match = contract.matchRequest(accounts.deployer, 1, 1);
    expect(match).toEqual({ ok: false, value: 112 });
  });

  it("should prevent duplicate matches", () => {
    contract.matchRequest(accounts.deployer, 1, 1);
    const duplicate = contract.matchRequest(accounts.deployer, 1, 1);
    expect(duplicate).toEqual({ ok: false, value: 104 });
  });

  it("should confirm a match", () => {
    contract.matchRequest(accounts.deployer, 1, 1);
    const confirm = contract.confirmMatch(accounts.deployer, 1, 1);
    expect(confirm).toEqual({ ok: true, value: true });

    const details = contract.getMatchDetails(1, 1);
    expect(details.value?.status).toBe("confirmed");

    const inventory = contract.state.inventories.get(1)!;
    expect(inventory.quantity).toBe(100);
  });

  it("should prevent confirmation after expiry", () => {
    contract.matchRequest(accounts.deployer, 1, 1);
    contract.state.blockHeight += 101; // Expire
    const confirm = contract.confirmMatch(accounts.deployer, 1, 1);
    expect(confirm).toEqual({ ok: false, value: 115 });
  });

  it("should allow cancellation of pending match", () => {
    contract.matchRequest(accounts.deployer, 1, 1);
    const cancel = contract.cancelMatch(accounts.deployer, 1, 1);
    expect(cancel).toEqual({ ok: true, value: true });

    const details = contract.getMatchDetails(1, 1);
    expect(details.value).toBeNull();
    expect(contract.getTotalMatches()).toEqual({ ok: true, value: 0 });
  });

  it("should prevent unauthorized cancellation", () => {
    contract.matchRequest(accounts.deployer, 1, 1);
    const cancel = contract.cancelMatch(accounts.unauthorized, 1, 1);
    expect(cancel).toEqual({ ok: false, value: 100 });
  });

  it("should calculate correct score", () => {
    const scoreResp = contract.matchRequest(accounts.deployer, 1, 1);
    const scoreDetails = contract.getScore(1, 1);
    expect(scoreDetails.value?.score).toBe(scoreResp.value);
  });
});