import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface BatchDetails {
  productType: string;
  origin: string;
  creator: string;
  creationTimestamp: number;
  status: string;
  logCount: number;
}

interface LogEntry {
  eventType: string;
  timestamp: number;
  location: string;
  actor: string;
  metadata: string;
  previousLogHash: Buffer;
}

interface ContractState {
  paused: boolean;
  admin: string;
  batchCounter: number;
  totalEvents: number;
  batches: Map<number, BatchDetails>;
  supplyChainLogs: Map<string, LogEntry>; // Key: `${batchId}-${logId}`
  batchOwners: Map<number, { currentOwner: string }>;
}

// Mock contract implementation
class ChainLoggerMock {
  private state: ContractState = {
    paused: false,
    admin: "deployer",
    batchCounter: 0,
    totalEvents: 0,
    batches: new Map(),
    supplyChainLogs: new Map(),
    batchOwners: new Map(),
  };

  private MAX_METADATA_LEN = 500;
  private MAX_LOGS_PER_BATCH = 1000;
  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_BATCH = 101;
  private ERR_INVALID_EVENT = 102;
  private ERR_PAUSED = 103;
  private ERR_INVALID_METADATA = 104;
  private ERR_BATCH_EXISTS = 105;

  private getBlockHeight(): number {
    return Date.now(); // Mock block height
  }

  private computeLogKey(batchId: number, logId: number): string {
    return `${batchId}-${logId}`;
  }

  private getPreviousLogHash(batchId: number, newLogId: number): Buffer {
    if (newLogId === 1) {
      return Buffer.alloc(32, 0);
    }
    const prevKey = this.computeLogKey(batchId, newLogId - 1);
    const prevLog = this.state.supplyChainLogs.get(prevKey);
    return prevLog ? prevLog.previousLogHash : Buffer.alloc(32, 0);
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  createBatch(caller: string, productType: string, origin: string, initialMetadata: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (productType.length > 50 || origin.length > 100 || initialMetadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    const newBatchId = this.state.batchCounter + 1;
    if (this.state.batches.has(newBatchId)) {
      return { ok: false, value: this.ERR_BATCH_EXISTS };
    }
    this.state.batches.set(newBatchId, {
      productType,
      origin,
      creator: caller,
      creationTimestamp: this.getBlockHeight(),
      status: "active",
      logCount: 0,
    });
    this.state.batchOwners.set(newBatchId, { currentOwner: caller });
    // Log initial event
    const logResult = this.logEvent(caller, newBatchId, "creation", origin, caller, initialMetadata);
    if (!logResult.ok) {
      return logResult;
    }
    this.state.batchCounter = newBatchId;
    return { ok: true, value: newBatchId };
  }

  logEvent(caller: string, batchId: number, eventType: string, location: string, actor: string, metadata: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const batch = this.state.batches.get(batchId);
    if (!batch) {
      return { ok: false, value: this.ERR_INVALID_BATCH };
    }
    const owner = this.state.batchOwners.get(batchId)?.currentOwner;
    if (caller !== owner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (eventType.length > 50 || location.length > 100 || metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    if (batch.logCount >= this.MAX_LOGS_PER_BATCH) {
      return { ok: false, value: 110 };
    }
    const newLogId = batch.logCount + 1;
    const prevHash = this.getPreviousLogHash(batchId, newLogId);
    const logKey = this.computeLogKey(batchId, newLogId);
    this.state.supplyChainLogs.set(logKey, {
      eventType,
      timestamp: this.getBlockHeight(),
      location,
      actor,
      metadata,
      previousLogHash: prevHash,
    });
    batch.logCount = newLogId;
    this.state.totalEvents += 1;
    return { ok: true, value: newLogId };
  }

  updateBatchStatus(caller: string, batchId: number, newStatus: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const batch = this.state.batches.get(batchId);
    if (!batch) {
      return { ok: false, value: this.ERR_INVALID_BATCH };
    }
    const owner = this.state.batchOwners.get(batchId)?.currentOwner;
    if (caller !== owner) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (newStatus.length > 20) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    batch.status = newStatus;
    return { ok: true, value: true };
  }

  updateOwner(caller: string, batchId: number, newOwner: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const batch = this.state.batches.get(batchId);
    if (!batch) {
      return { ok: false, value: this.ERR_INVALID_BATCH };
    }
    // Mock trait check: assume caller is 'OwnershipTransfer'
    if (caller !== "OwnershipTransfer") {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.batchOwners.set(batchId, { currentOwner: newOwner });
    return { ok: true, value: true };
  }

  getBatchDetails(batchId: number): ClarityResponse<BatchDetails | null> {
    return { ok: true, value: this.state.batches.get(batchId) ?? null };
  }

  getLog(batchId: number, logId: number): ClarityResponse<LogEntry | null> {
    const key = this.computeLogKey(batchId, logId);
    return { ok: true, value: this.state.supplyChainLogs.get(key) ?? null };
  }

  getBatchLogCount(batchId: number): ClarityResponse<number> {
    const batch = this.state.batches.get(batchId);
    if (!batch) {
      return { ok: false, value: this.ERR_INVALID_BATCH };
    }
    return { ok: true, value: batch.logCount };
  }

  getBatchOwner(batchId: number): ClarityResponse<{ currentOwner: string } | null> {
    return { ok: true, value: this.state.batchOwners.get(batchId) ?? null };
  }

  getTotalBatches(): ClarityResponse<number> {
    return { ok: true, value: this.state.batchCounter };
  }

  getTotalEvents(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalEvents };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  verifyLogChain(batchId: number, logId: number): ClarityResponse<boolean> {
    const key = this.computeLogKey(batchId, logId);
    const log = this.state.supplyChainLogs.get(key);
    if (!log) {
      return { ok: false, value: this.ERR_INVALID_EVENT };
    }
    const expectedPrevHash = this.getPreviousLogHash(batchId, logId);
    const isValid = log.previousLogHash.equals(expectedPrevHash);
    return { ok: isValid, value: isValid ? true : this.ERR_INVALID_EVENT };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
  ownershipTransfer: "OwnershipTransfer",
};

describe("ChainLogger Contract", () => {
  let contract: ChainLoggerMock;

  beforeEach(() => {
    contract = new ChainLoggerMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct defaults", () => {
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
    expect(contract.getAdmin()).toEqual({ ok: true, value: "deployer" });
    expect(contract.getTotalBatches()).toEqual({ ok: true, value: 0 });
    expect(contract.getTotalEvents()).toEqual({ ok: true, value: 0 });
  });

  it("should allow admin to set new admin", () => {
    const result = contract.setAdmin(accounts.deployer, accounts.user1);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getAdmin()).toEqual({ ok: true, value: accounts.user1 });
  });

  it("should prevent non-admin from setting admin", () => {
    const result = contract.setAdmin(accounts.user1, accounts.user2);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to pause and unpause contract", () => {
    let result = contract.pauseContract(accounts.deployer);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    result = contract.unpauseContract(accounts.deployer);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should create a new batch with initial log", () => {
    const result = contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial batch details");
    expect(result.ok).toBe(true);
    const batchId = result.value as number;
    expect(batchId).toBe(1);
    expect(contract.getTotalBatches()).toEqual({ ok: true, value: 1 });
    expect(contract.getTotalEvents()).toEqual({ ok: true, value: 1 });

    const batchDetails = contract.getBatchDetails(batchId);
    expect(batchDetails).toEqual({
      ok: true,
      value: expect.objectContaining({
        productType: "Coffee Beans",
        origin: "Ethiopia Farm",
        creator: accounts.user1,
        status: "active",
        logCount: 1,
      }),
    });

    const log = contract.getLog(batchId, 1);
    expect(log).toEqual({
      ok: true,
      value: expect.objectContaining({
        eventType: "creation",
        location: "Ethiopia Farm",
        actor: accounts.user1,
        metadata: "Initial batch details",
        previousLogHash: Buffer.alloc(32, 0),
      }),
    });
  });

  it("should prevent batch creation when paused", () => {
    contract.pauseContract(accounts.deployer);
    const result = contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Details");
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should allow logging events for batch", () => {
    contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial");
    const batchId = 1;

    const logResult = contract.logEvent(accounts.user1, batchId, "processing", "Factory A", accounts.user1, "Processed beans");
    expect(logResult).toEqual({ ok: true, value: 2 });
    expect(contract.getTotalEvents()).toEqual({ ok: true, value: 2 });

    const log = contract.getLog(batchId, 2);
    expect(log.ok).toBe(true);
    expect((log.value as LogEntry).eventType).toBe("processing");
  });

  it("should prevent unauthorized logging", () => {
    contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial");
    const batchId = 1;

    const logResult = contract.logEvent(accounts.user2, batchId, "processing", "Factory A", accounts.user2, "Unauthorized");
    expect(logResult).toEqual({ ok: false, value: 100 });
  });

  it("should update batch status by owner", () => {
    contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial");
    const batchId = 1;

    const result = contract.updateBatchStatus(accounts.user1, batchId, "completed");
    expect(result).toEqual({ ok: true, value: true });

    const details = contract.getBatchDetails(batchId);
    expect((details.value as BatchDetails).status).toBe("completed");
  });

  it("should allow updating owner by authorized caller", () => {
    contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial");
    const batchId = 1;

    const result = contract.updateOwner(accounts.ownershipTransfer, batchId, accounts.user2);
    expect(result).toEqual({ ok: true, value: true });

    const owner = contract.getBatchOwner(batchId);
    expect(owner).toEqual({ ok: true, value: { currentOwner: accounts.user2 } });
  });

  it("should verify log chain integrity", () => {
    contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", "Initial");
    const batchId = 1;
    contract.logEvent(accounts.user1, batchId, "processing", "Factory A", accounts.user1, "Processed");

    let verify = contract.verifyLogChain(batchId, 1);
    expect(verify).toEqual({ ok: true, value: true });

    verify = contract.verifyLogChain(batchId, 2);
    expect(verify).toEqual({ ok: true, value: true });
  });

  it("should reject invalid metadata length", () => {
    const longMetadata = "a".repeat(501);
    const result = contract.createBatch(accounts.user1, "Coffee Beans", "Ethiopia Farm", longMetadata);
    expect(result).toEqual({ ok: false, value: 104 });
  });
});