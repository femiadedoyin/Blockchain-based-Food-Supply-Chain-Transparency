;; ChainLogger.clar - Core Supply Chain Logging Contract
;; This contract handles the creation of product batches and logging of immutable supply chain events.
;; It ensures traceability, authenticity, and integration with other contracts like OwnershipTransfer and CertificationManager.
;; Features include batch creation, event logging with metadata, log verification, and read-only queries for transparency.

;; Constants
(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-BATCH u101)
(define-constant ERR-INVALID-EVENT u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-INVALID-METADATA u104)
(define-constant ERR-BATCH-EXISTS u105)
(define-constant ERR-INVALID-LOCATION u106)
(define-constant ERR-INVALID-PRODUCT-TYPE u107)
(define-constant ERR-INVALID-ORIGIN u108)
(define-constant ERR-INVALID-ACTOR u109)
(define-constant ERR-MAX-LOGS-REACHED u110)
(define-constant ERR-INVALID-QUERY u111)

(define-constant MAX_METADATA_LEN u500)
(define-constant MAX_LOGS_PER_BATCH u1000) ;; Arbitrary limit for safety

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var batch-counter uint u0)
(define-data-var total-events uint u0)

;; Data Maps
(define-map batches
  { batch-id: uint }
  {
    product-type: (string-ascii 50),
    origin: (string-ascii 100),
    creator: principal,
    creation-timestamp: uint,
    status: (string-ascii 20), ;; e.g., "active", "completed", "disputed"
    log-count: uint
  }
)

(define-map supply-chain-logs
  { batch-id: uint, log-id: uint }
  {
    event-type: (string-ascii 50), ;; e.g., "harvesting", "processing", "shipping"
    timestamp: uint,
    location: (string-ascii 100),
    actor: principal,
    metadata: (string-utf8 500), ;; Additional details, JSON-like
    previous-log-hash: (buff 32) ;; For chain integrity (hash of previous log)
  }
)

(define-map batch-owners
  { batch-id: uint }
  { current-owner: principal }
)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get admin))
)

(define-private (assert-not-paused)
  (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
)

(define-private (assert-valid-string-ascii (str (string-ascii 100)) (max-len uint))
  (asserts! (<= (len str) max-len) (err ERR-INVALID-METADATA))
)

(define-private (assert-valid-string-utf8 (str (string-utf8 500)) (max-len uint))
  (asserts! (<= (len str) max-len) (err ERR-INVALID-METADATA))
)

(define-private (compute-log-hash (batch-id uint) (log-id uint))
  (hash160 (concat (unwrap-panic (element-at (unwrap-panic (to-consensus-buff? batch-id)) u0)) 
                   (unwrap-panic (element-at (unwrap-panic (to-consensus-buff? log-id)) u0))))
)

(define-private (get-previous-log-hash (batch-id uint) (new-log-id uint))
  (if (is-eq new-log-id u1)
    0x0000000000000000000000000000000000000000000000000000000000000000 ;; Genesis hash
    (get previous-log-hash (unwrap-panic (map-get? supply-chain-logs { batch-id: batch-id, log-id: (- new-log-id u1) })))
  )
)

;; Public Functions

;; Admin Functions
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (ok (var-set admin new-admin))
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (ok (var-set contract-paused true))
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (ok (var-set contract-paused false))
  )
)

;; Batch Creation
(define-public (create-batch (product-type (string-ascii 50)) (origin (string-ascii 100)) (initial-metadata (string-utf8 500)))
  (let
    (
      (new-batch-id (+ (var-get batch-counter) u1))
    )
    (assert-not-paused)
    (assert-valid-string-ascii product-type u50)
    (assert-valid-string-ascii origin u100)
    (assert-valid-string-utf8 initial-metadata MAX_METADATA_LEN)
    (asserts! (is-none (map-get? batches { batch-id: new-batch-id })) (err ERR-BATCH-EXISTS))
    (map-set batches
      { batch-id: new-batch-id }
      {
        product-type: product-type,
        origin: origin,
        creator: tx-sender,
        creation-timestamp: block-height,
        status: "active",
        log-count: u0
      }
    )
    (map-set batch-owners { batch-id: new-batch-id } { current-owner: tx-sender })
    (try! (log-event new-batch-id "creation" origin tx-sender initial-metadata))
    (ok (var-set batch-counter new-batch-id))
  )
)

;; Event Logging
(define-public (log-event (batch-id uint) (event-type (string-ascii 50)) (location (string-ascii 100)) (actor principal) (metadata (string-utf8 500)))
  (let
    (
      (batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH)))
      (current-owner (get current-owner (unwrap! (map-get? batch-owners { batch-id: batch-id }) (err ERR-INVALID-BATCH))))
      (new-log-id (+ (get log-count batch) u1))
      (prev-hash (get-previous-log-hash batch-id new-log-id))
    )
    (assert-not-paused)
    (asserts! (is-eq tx-sender current-owner) (err ERR-UNAUTHORIZED))
    (assert-valid-string-ascii event-type u50)
    (assert-valid-string-ascii location u100)
    (assert-valid-string-utf8 metadata MAX_METADATA_LEN)
    (asserts! (< (get log-count batch) MAX_LOGS_PER_BATCH) (err ERR-MAX-LOGS-REACHED))
    (map-set supply-chain-logs
      { batch-id: batch-id, log-id: new-log-id }
      {
        event-type: event-type,
        timestamp: block-height,
        location: location,
        actor: actor,
        metadata: metadata,
        previous-log-hash: prev-hash
      }
    )
    (map-set batches
      { batch-id: batch-id }
      (merge batch { log-count: new-log-id })
    )
    (ok (var-set total-events (+ (var-get total-events) u1)))
  )
)

;; Update Batch Status
(define-public (update-batch-status (batch-id uint) (new-status (string-ascii 20)))
  (let
    (
      (batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH)))
      (current-owner (get current-owner (unwrap! (map-get? batch-owners { batch-id: batch-id }) (err ERR-INVALID-BATCH))))
    )
    (assert-not-paused)
    (asserts! (is-eq tx-sender current-owner) (err ERR-UNAUTHORIZED))
    (assert-valid-string-ascii new-status u20)
    (ok (map-set batches
      { batch-id: batch-id }
      (merge batch { status: new-status })
    ))
  )
)

;; Integration Function: Update Owner (Called by OwnershipTransfer contract)
(define-public (update-owner (batch-id uint) (new-owner principal))
  (let
    (
      (batch (unwrap! (map-get? batches { batch-id: batch-id }) (err ERR-INVALID-BATCH)))
    )
    (assert-not-paused)
    (asserts! (is-eq contract-caller .ownership-transfer) (err ERR-UNAUTHORIZED))
    (ok (map-set batch-owners { batch-id: batch-id } { current-owner: new-owner }))
  )
)

;; Read-Only Functions
(define-read-only (get-batch-details (batch-id uint))
  (map-get? batches { batch-id: batch-id })
)

(define-read-only (get-log (batch-id uint) (log-id uint))
  (map-get? supply-chain-logs { batch-id: batch-id, log-id: log-id })
)

(define-read-only (get-batch-log-count (batch-id uint))
  (match (map-get? batches { batch-id: batch-id })
    batch (ok (get log-count batch))
    (err ERR-INVALID-BATCH)
  )
)

(define-read-only (get-batch-owner (batch-id uint))
  (map-get? batch-owners { batch-id: batch-id })
)

(define-read-only (get-total-batches)
  (var-get batch-counter)
)

(define-read-only (get-total-events)
  (var-get total-events)
)

(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get admin)
)

(define-read-only (verify-log-chain (batch-id uint) (log-id uint))
  (let
    (
      (log (unwrap! (map-get? supply-chain-logs { batch-id: batch-id, log-id: log-id }) (err ERR-INVALID-EVENT)))
      (expected-prev-hash (get-previous-log-hash batch-id log-id))
    )
    (if (is-eq (get previous-log-hash log) expected-prev-hash)
      (ok true)
      (err ERR-INVALID-EVENT)
    )
  )
)
