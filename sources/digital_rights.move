module digital_rights::digital_rights {
    use iota::object::{Self, UID, ID};
    use iota::transfer;
    use iota::tx_context::{Self, TxContext, sender};
    use std::string::{Self, String};
    use iota::clock::{Self, Clock};
    use iota::event;
    use iota::table::{Self, Table};
    use std::hash;

    // Error codes
    const ERightNotActive: u64 = 1;
    const ERightExpired: u64 = 2;
    const EInvalidActivationCode: u64 = 3;
    const ERightAlreadyActivated: u64 = 4;
    const ENotVendor: u64 = 5;
    const EVendorNotRegistered: u64 = 6;
    const EInvalidExpiryDate: u64 = 7;
    const ERightRevoked: u64 = 8;
    const EVendorAlreadyRegistered: u64 = 9;
    const EMaxDevicesReached: u64 = 10;
    const ENoDevicesToRemove: u64 = 11;
    const ENotOwner: u64 = 12;

    // Data structures
    public struct DIGITAL_RIGHTS has drop {}

    /// Digital right NFT
    public struct DigitalRight has key, store {
        id: UID,
        product_id: String,
        right_key: String,
        vendor: address,
        activation_code_hash: vector<u8>,
        created_at: u64,
        expiry_date: u64,
        is_active: bool,
        activated: bool,
        activated_at: u64,
        max_devices: u8,
        current_devices: u8,
        revoked: bool,
        revoked_at: u64,
    }

    /// Vendor info
    public struct VendorInfo has store {
        vendor_address: address,
        company_name: String,
        registered_at: u64,
        total_rights_issued: u64,
        is_active: bool,
    }

    /// Vendor registry
    public struct VendorRegistry has key {
        id: UID,
        vendors: Table<address, VendorInfo>,
        total_vendors: u64,
        total_rights_minted: u64,
    }

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    // Events
    public struct RightMinted has copy, drop {
        right_id: ID,
        product_id: String,
        vendor: address,
        created_at: u64,
    }

    public struct RightActivated has copy, drop {
        right_id: ID,
        product_id: String,
        activated_by: address,
        activated_at: u64,
    }

    public struct RightRevoked has copy, drop {
        right_id: ID,
        revoked_by: address,
        revoked_at: u64,
    }

    public struct DeviceAdded has copy, drop {
        right_id: ID,
        current_devices: u8,
        max_devices: u8,
    }

    public struct DeviceRemoved has copy, drop {
        right_id: ID,
        current_devices: u8,
    }

    /// Event for right renewal (consume-and-recreate)
    public struct RightRenewed has copy, drop {
        old_right_id: ID,
        new_right_id: ID,
        renewed_by: address,
        new_expiry_date: u64,
        renewed_at: u64,
    }

    // Init — runs once at deploy
    fun init(witness: DIGITAL_RIGHTS, ctx: &mut TxContext) {
        let registry = VendorRegistry {
            id: object::new(ctx),
            vendors: table::new(ctx),
            total_vendors: 0,
            total_rights_minted: 0,
        };
        transfer::share_object(registry);
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, sender(ctx));
        let _ = witness;
    }

    // Entry functions

    /// Register vendor
    public entry fun register_vendor(
        registry: &mut VendorRegistry,
        company_name: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let vendor_address = sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        assert!(!table::contains(&registry.vendors, vendor_address), EVendorAlreadyRegistered);
        let vendor_info = VendorInfo {
            vendor_address,
            company_name: string::utf8(company_name),
            registered_at: timestamp,
            total_rights_issued: 0,
            is_active: true,
        };
        table::add(&mut registry.vendors, vendor_address, vendor_info);
        registry.total_vendors = registry.total_vendors + 1;
    }

    /// Mint a digital right NFT
    public entry fun mint_right(
        registry: &mut VendorRegistry,
        product_id: vector<u8>,
        right_key: vector<u8>,
        activation_code: vector<u8>,
        expiry_date: u64,
        max_devices: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let vendor = sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        assert!(table::contains(&registry.vendors, vendor), EVendorNotRegistered);
        if (expiry_date != 0) {
            assert!(expiry_date > timestamp, EInvalidExpiryDate);
        };
        let activation_code_hash = hash::sha3_256(activation_code);
        let right_uid = object::new(ctx);
        let right_id = object::uid_to_inner(&right_uid);
        let right = DigitalRight {
            id: right_uid,
            product_id: string::utf8(product_id),
            right_key: string::utf8(right_key),
            vendor,
            activation_code_hash,
            created_at: timestamp,
            expiry_date,
            is_active: true,
            activated: false,
            activated_at: 0,
            max_devices,
            current_devices: 0,
            revoked: false,
            revoked_at: 0,
        };
        let vendor_info = table::borrow_mut(&mut registry.vendors, vendor);
        vendor_info.total_rights_issued = vendor_info.total_rights_issued + 1;
        registry.total_rights_minted = registry.total_rights_minted + 1;
        event::emit(RightMinted {
            right_id,
            product_id: string::utf8(product_id),
            vendor,
            created_at: timestamp,
        });
        transfer::public_transfer(right, vendor);
    }

    /// Activate a right
    public entry fun activate_right(
        mut right: DigitalRight,
        activation_code: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);
        let user = sender(ctx);
        assert!(right.is_active, ERightNotActive);
        assert!(!right.activated, ERightAlreadyActivated);
        let provided_hash = hash::sha3_256(activation_code);
        assert!(provided_hash == right.activation_code_hash, EInvalidActivationCode);
        if (right.expiry_date != 0) {
            assert!(timestamp < right.expiry_date, ERightExpired);
        };
        assert!(!right.revoked, ERightRevoked);
        let right_id = object::id(&right);
        let product_id_copy = right.product_id;
        right.activated = true;
        right.activated_at = timestamp;
        event::emit(RightActivated {
            right_id,
            product_id: product_id_copy,
            activated_by: user,
            activated_at: timestamp,
        });
        transfer::public_transfer(right, user);
    }

    /// Check if a right is valid
    public fun is_right_valid(right: &DigitalRight, clock: &Clock): bool {
        let timestamp = clock::timestamp_ms(clock);
        if (!right.is_active) return false;
        if (!right.activated) return false;
        if (right.revoked) return false;
        if (right.expiry_date != 0 && timestamp >= right.expiry_date) return false;
        true
    }

    /// Revoke a right (only the vendor can do this)
    public entry fun revoke_right(
        right: &mut DigitalRight,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let caller = sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        assert!(caller == right.vendor, ENotVendor);
        right.revoked = true;
        right.revoked_at = timestamp;
        right.is_active = false;
        event::emit(RightRevoked {
            right_id: object::id(right),
            revoked_by: caller,
            revoked_at: timestamp,
        });
    }

    /// Add a device to the right (only the owner)
    public entry fun add_device(
        right: &mut DigitalRight,
        ctx: &mut TxContext
    ) {
        let caller = sender(ctx);
        assert!(right.is_active, ERightNotActive);
        assert!(right.activated, ERightNotActive);
        assert!(!right.revoked, ERightRevoked);
        assert!(right.current_devices < right.max_devices, EMaxDevicesReached);
        let _ = caller;
        right.current_devices = right.current_devices + 1;
        event::emit(DeviceAdded {
            right_id: object::id(right),
            current_devices: right.current_devices,
            max_devices: right.max_devices,
        });
    }

    /// Remove a device from the right (only the owner)
    public entry fun remove_device(
        right: &mut DigitalRight,
        ctx: &mut TxContext
    ) {
        let caller = sender(ctx);
        assert!(right.is_active, ERightNotActive);
        assert!(!right.revoked, ERightRevoked);
        assert!(right.current_devices > 0, ENoDevicesToRemove);
        let _ = caller;
        right.current_devices = right.current_devices - 1;
        event::emit(DeviceRemoved {
            right_id: object::id(right),
            current_devices: right.current_devices,
        });
    }

    /// Renew a right: consumes the old object and creates a new one with updated expiry.
    /// This is the minimal consume-and-recreate lifecycle pattern.
    /// Only the vendor who originally issued the right can renew it.
    public entry fun renew_right(
        right: DigitalRight,
        new_expiry_date: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let caller = sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        // Only the vendor can renew
        assert!(caller == right.vendor, ENotVendor);
        // Must not be revoked
        assert!(!right.revoked, ERightRevoked);
        // New expiry must be in the future (if not perpetual)
        if (new_expiry_date != 0) {
            assert!(new_expiry_date > timestamp, EInvalidExpiryDate);
        };

        let old_right_id = object::id(&right);

        // Destructure the old right (consume it)
        let DigitalRight {
            id,
            product_id,
            right_key,
            vendor,
            activation_code_hash,
            created_at: _,
            expiry_date: _,
            is_active,
            activated,
            activated_at,
            max_devices,
            current_devices,
            revoked: _,
            revoked_at: _,
        } = right;

        object::delete(id);

        // Create the new version
        let new_uid = object::new(ctx);
        let new_right_id = object::uid_to_inner(&new_uid);

        let new_right = DigitalRight {
            id: new_uid,
            product_id,
            right_key,
            vendor,
            activation_code_hash,
            created_at: timestamp,
            expiry_date: new_expiry_date,
            is_active,
            activated,
            activated_at,
            max_devices,
            current_devices,
            revoked: false,
            revoked_at: 0,
        };

        event::emit(RightRenewed {
            old_right_id,
            new_right_id,
            renewed_by: caller,
            new_expiry_date,
            renewed_at: timestamp,
        });

        transfer::public_transfer(new_right, caller);
    }
}
