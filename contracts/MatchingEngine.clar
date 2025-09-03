;; MatchingEngine.clar
;; Core contract for matching emergency supply requests to inventories in a decentralized supply chain network.
;; This contract automates and facilitates the matching process, ensuring fair, transparent, and efficient allocation
;; during emergencies. It integrates with RequestSystem.clar for requests, InventoryManagement.clar for supplies,
;; and can trigger shipments via ShipmentTracking.clar.

;; Constants for error codes
(define-constant ERR_NOT_AUTHORIZED u100)
(define-constant ERR_REQUEST_NOT_FOUND u101)
(define-constant ERR_INVENTORY_NOT_FOUND u102)
(define-constant ERR_INVALID_MATCH u103)
(define-constant ERR_MATCH_ALREADY_EXISTS u104)
(define-constant ERR_INSUFFICIENT_QUANTITY u105)
(define-constant ERR_LOCATION_MISMATCH u106)
(define-constant ERR_URGENCY_TOO_LOW u107)
(define-constant ERR_CONTRACT_PAUSED u108)
(define-constant ERR_INVALID_SCORE u109)
(define-constant ERR_NO_PENDING_MATCHES u110)
(define-constant ERR_MATCH_NOT_CONFIRMED u111)
(define-constant ERR_EMERGENCY_NOT_ACTIVE u112)
(define-constant ERR_INVALID_PARTICIPANT u113)
(define-constant ERR_MAX_MATCHES_REACHED u114)
(define-constant ERR_INVALID_TIMESTAMP u115)

;; Constants for system parameters
(define-constant MAX_MATCHES_PER_REQUEST u10) ;; Limit to prevent spam
(define-constant MIN_URGENCY_SCORE u50) ;; Threshold for matching
(define-constant LOCATION_COMPATIBILITY_RADIUS u100) ;; In km, for location matching
(define-constant SCORE_WEIGHT_URGENCY u60) ;; Percentage weight for urgency in scoring
(define-constant SCORE_WEIGHT_QUANTITY u20) ;; Weight for quantity match
(define-constant SCORE_WEIGHT_LOCATION u20) ;; Weight for location proximity

;; Data variables
(define-data-var contract-paused bool false)
(define-data-var admin principal tx-sender)
(define-data-var total-matches uint u0)

;; Data maps
(define-map Matches
  { request-id: uint, inventory-id: uint }
  {
    supplier: principal,
    requester: principal,
    quantity-matched: uint,
    score: uint,
    status: (string-ascii 20), ;; e.g., "pending", "confirmed", "cancelled", "fulfilled"
    timestamp: uint,
    expiry: uint ;; Block height when match expires if not confirmed
  }
)

(define-map RequestMatches
  { request-id: uint }
  { match-count: uint }
)

(define-map PendingMatchesByRequest
  { request-id: uint, index: uint }
  { inventory-id: uint, score: uint }
)

(define-map Scores
  { request-id: uint, inventory-id: uint }
  { score: uint, calculated-at: uint }
)

;; Traits for dependencies (assuming other contracts implement these)
(define-trait request-trait
  (
    (get-request (uint) (response { urgency: uint, quantity: uint, location: (tuple (lat int) (long int)), item-type: (string-ascii 50), emergency-id: uint } uint))
    (is-request-active (uint) (response bool uint))
  )
)

(define-trait inventory-trait
  (
    (get-inventory (uint) (response { quantity: uint, location: (tuple (lat int) (long int)), item-type: (string-ascii 50), supplier: principal } uint))
    (update-inventory-quantity (uint uint) (response bool uint))
  )
)

(define-trait emergency-trait
  (
    (is-emergency-active (uint) (response bool uint))
  )
)

;; Private helper functions
(define-private (is-authorized-caller (caller principal))
  (or (is-eq caller tx-sender) (is-eq caller (var-get admin)))
)

(define-private (calculate-distance (loc1 (tuple (lat int) (long int))) (loc2 (tuple (lat int) (long int))))
  ;; Simplified distance calculation (not accurate geodesic, but sufficient for demo)
  (let
    (
      (delta-lat (- (get lat loc1) (get lat loc2)))
      (delta-long (- (get long loc1) (get long loc2)))
    )
    (+ (* delta-lat delta-lat) (* delta-long delta-long)) ;; Squared distance
  )
)

(define-private (is-location-compatible (loc1 (tuple (lat int) (long int))) (loc2 (tuple (lat int) (long int))))
  (<= (calculate-distance loc1 loc2) (* LOCATION_COMPATIBILITY_RADIUS LOCATION_COMPATIBILITY_RADIUS))
)

(define-private (compute-match-score (urgency uint) (req-quantity uint) (inv-quantity uint) (distance uint))
  (let
    (
      (urgency-score (* urgency SCORE_WEIGHT_URGENCY))
      (quantity-score (if (>= inv-quantity req-quantity) (* u100 SCORE_WEIGHT_QUANTITY) (* (/ inv-quantity req-quantity) SCORE_WEIGHT_QUANTITY)))
      (location-score (* (- u100 (/ distance LOCATION_COMPATIBILITY_RADIUS)) SCORE_WEIGHT_LOCATION))
    )
    (/ (+ urgency-score quantity-score location-score) u100)
  )
)

(define-private (validate-match (request { urgency: uint, quantity: uint, location: (tuple (lat int) (long int)), item-type: (string-ascii 50), emergency-id: uint })
                                (inventory { quantity: uint, location: (tuple (lat int) (long int)), item-type: (string-ascii 50), supplier: principal }))
  (and
    (is-eq (get item-type request) (get item-type inventory))
    (>= (get quantity inventory) (get quantity request))
    (is-location-compatible (get location request) (get location inventory))
    (>= (get urgency request) MIN_URGENCY_SCORE)
  )
)

;; Public functions
(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (var-set contract-paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (var-set contract-paused false)
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (match-request (request-id uint) (inventory-id uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR_CONTRACT_PAUSED))
    (asserts! (is-authorized-caller tx-sender) (err ERR_NOT_AUTHORIZED))
    (let
      (
        (request (unwrap! (contract-call? .RequestSystem get-request request-id) (err ERR_REQUEST_NOT_FOUND)))
        (inventory (unwrap! (contract-call? .InventoryManagement get-inventory inventory-id) (err ERR_INVENTORY_NOT_FOUND)))
        (emergency-active (unwrap! (contract-call? .EmergencyDeclaration is-emergency-active (get emergency-id request)) (err ERR_EMERGENCY_NOT_ACTIVE)))
        (existing-match (map-get? Matches { request-id: request-id, inventory-id: inventory-id }))
        (request-matches (default-to { match-count: u0 } (map-get? RequestMatches { request-id: request-id })))
      )
      (asserts! emergency-active (err ERR_EMERGENCY_NOT_ACTIVE))
      (asserts! (is-none existing-match) (err ERR_MATCH_ALREADY_EXISTS))
      (asserts! (< (get match-count request-matches) MAX_MATCHES_PER_REQUEST) (err ERR_MAX_MATCHES_REACHED))
      (asserts! (validate-match request inventory) (err ERR_INVALID_MATCH))
      (let
        (
          (distance (calculate-distance (get location request) (get location inventory)))
          (score (compute-match-score (get urgency request) (get quantity request) (get quantity inventory) distance))
        )
        (asserts! (>= score MIN_URGENCY_SCORE) (err ERR_INVALID_SCORE))
        (map-set Scores { request-id: request-id, inventory-id: inventory-id } { score: score, calculated-at: block-height })
        (map-set Matches
          { request-id: request-id, inventory-id: inventory-id }
          {
            supplier: (get supplier inventory),
            requester: tx-sender,
            quantity-matched: (get quantity request),
            score: score,
            status: "pending",
            timestamp: block-height,
            expiry: (+ block-height u100) ;; Expires in 100 blocks if not confirmed
          }
        )
        (map-set RequestMatches { request-id: request-id } { match-count: (+ (get match-count request-matches) u1) })
        (var-set total-matches (+ (var-get total-matches) u1))
        (print { event: "match-created", request-id: request-id, inventory-id: inventory-id, score: score })
        (ok score)
      )
    )
  )
)

(define-public (confirm-match (request-id uint) (inventory-id uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR_CONTRACT_PAUSED))
    (let
      (
        (match (unwrap! (map-get? Matches { request-id: request-id, inventory-id: inventory-id }) (err ERR_MATCH_NOT_FOUND)))
        (request (unwrap! (contract-call? .RequestSystem get-request request-id) (err ERR_REQUEST_NOT_FOUND)))
        (inventory (unwrap! (contract-call? .InventoryManagement get-inventory inventory-id) (err ERR_INVENTORY_NOT_FOUND)))
      )
      (asserts! (is-eq (get status match) "pending") (err ERR_MATCH_NOT_CONFIRMED))
      (asserts! (is-eq tx-sender (get requester match)) (err ERR_NOT_AUTHORIZED))
      (asserts! (<= block-height (get expiry match)) (err ERR_INVALID_TIMESTAMP))
      (unwrap! (contract-call? .InventoryManagement update-inventory-quantity inventory-id (- (get quantity inventory) (get quantity-matched match))) (err ERR_INSUFFICIENT_QUANTITY))
      (map-set Matches
        { request-id: request-id, inventory-id: inventory-id }
        (merge match { status: "confirmed" })
      )
      ;; Trigger shipment creation in ShipmentTracking.clar (assuming it exists)
      (try! (contract-call? .ShipmentTracking initiate-shipment request-id inventory-id (get quantity-matched match) (get location request)))
      (print { event: "match-confirmed", request-id: request-id, inventory-id: inventory-id })
      (ok true)
    )
  )
)

(define-public (cancel-match (request-id uint) (inventory-id uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR_CONTRACT_PAUSED))
    (let
      (
        (match (unwrap! (map-get? Matches { request-id: request-id, inventory-id: inventory-id }) (err ERR_MATCH_NOT_FOUND)))
        (request-matches (unwrap! (map-get? RequestMatches { request-id: request-id }) (err ERR_REQUEST_NOT_FOUND)))
      )
      (asserts! (or (is-eq tx-sender (get requester match)) (is-eq tx-sender (get supplier match))) (err ERR_NOT_AUTHORIZED))
      (asserts! (is-eq (get status match) "pending") (err ERR_MATCH_NOT_CONFIRMED))
      (map-delete Matches { request-id: request-id, inventory-id: inventory-id })
      (map-delete Scores { request-id: request-id, inventory-id: inventory-id })
      (map-set RequestMatches { request-id: request-id } { match-count: (- (get match-count request-matches) u1) })
      (var-set total-matches (- (var-get total-matches) u1))
      (print { event: "match-cancelled", request-id: request-id, inventory-id: inventory-id })
      (ok true)
    )
  )
)

(define-public (auto-match-request (request-id uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR_CONTRACT_PAUSED))
    (asserts! (is-authorized-caller tx-sender) (err ERR_NOT_AUTHORIZED))
    ;; This function would iterate over available inventories (in practice, off-chain indexing needed)
    ;; For Clarity, assume a list of candidate inventory-ids is provided or simulate with a fixed set
    ;; To keep it simple, placeholder for auto-matching logic
    (ok true) ;; Expand in production with loops over maps if indexed
  )
)

;; Read-only functions
(define-read-only (get-match-details (request-id uint) (inventory-id uint))
  (map-get? Matches { request-id: request-id, inventory-id: inventory-id })
)

(define-read-only (get-score (request-id uint) (inventory-id uint))
  (map-get? Scores { request-id: request-id, inventory-id: inventory-id })
)

(define-read-only (get-total-matches)
  (var-get total-matches)
)

(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get admin)
)

(define-read-only (get-request-match-count (request-id uint))
  (default-to u0 (get match-count (map-get? RequestMatches { request-id: request-id })))
)