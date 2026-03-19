module software_license::software_license {
    use iota::object::{Self, UID, ID};
    use iota::transfer;
    use iota::tx_context::{Self, TxContext, sender};
    use std::string::{Self, String};
    use iota::clock::{Self, Clock};
    use iota::event;
    use iota::table::{Self, Table};
    use std::hash;

    // Codici di errore
    const ELicenseNotActive: u64 = 1;
    const ELicenseExpired: u64 = 2;
    const EInvalidActivationCode: u64 = 3;
    const ELicenseAlreadyActivated: u64 = 4;
    const ENotVendor: u64 = 5;
    const EVendorNotRegistered: u64 = 6;
    const EInvalidExpiryDate: u64 = 7;
    const ELicenseRevoked: u64 = 8;
    const EVendorAlreadyRegistered: u64 = 9;

    // Strutture dati

    public struct SOFTWARE_LICENSE has drop {}

    /// NFT LICENZA PRE-ATTIVAZIONE
    public struct SoftwareLicense has key, store {
        id: UID,
        product_id: String,
        license_key: String,
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

    /// Info Vendor
    public struct VendorInfo has store {
        vendor_address: address,
        company_name: String,
        registered_at: u64,
        total_licenses_issued: u64,
        is_active: bool,
    }

    /// Registry Vendor 
    public struct VendorRegistry has key {
        id: UID,
        vendors: Table<address, VendorInfo>,
        total_vendors: u64,
        total_licenses_minted: u64,
    }

    /// Capability amministratore
    public struct AdminCap has key, store {
        id: UID,
    }

    // Eventi 

    public struct LicenseMinted has copy, drop {
        license_id: ID,
        product_id: String,
        vendor: address,
        created_at: u64,
    }

    public struct LicenseActivated has copy, drop {
        license_id: ID,
        product_id: String,
        activated_by: address,
        activated_at: u64,
    }

    public struct LicenseRevoked has copy, drop {
        license_id: ID,
        revoked_by: address,
        revoked_at: u64,
    }

    // Init - viene eseguita una sola volta al deploy

    fun init(witness: SOFTWARE_LICENSE, ctx: &mut TxContext) {
        let registry = VendorRegistry {
            id: object::new(ctx),
            vendors: table::new(ctx),
            total_vendors: 0,
            total_licenses_minted: 0,
        };
        transfer::share_object(registry);

        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, sender(ctx));

        let _ = witness;
    }

    // Funzioni principali 

    /// Registrazione vendor
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
            total_licenses_issued: 0,
            is_active: true,
        };

        table::add(&mut registry.vendors, vendor_address, vendor_info);
        registry.total_vendors = registry.total_vendors + 1;
    }

    /// Mint licenza NFT 
    public entry fun mint_license(
        registry: &mut VendorRegistry,
        product_id: vector<u8>,
        license_key: vector<u8>,
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
        let license_uid = object::new(ctx);
        let license_id = object::uid_to_inner(&license_uid);

        let license = SoftwareLicense {
            id: license_uid,
            product_id: string::utf8(product_id),
            license_key: string::utf8(license_key),
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
        vendor_info.total_licenses_issued = vendor_info.total_licenses_issued + 1;
        registry.total_licenses_minted = registry.total_licenses_minted + 1;

        event::emit(LicenseMinted {
            license_id,
            product_id: string::utf8(product_id),
            vendor,
            created_at: timestamp,
        });

        transfer::public_transfer(license, vendor);
    }

    /// Attivazione licenza (consuma l'NFT e lo trasferisce all'utente)
    public entry fun activate_license(
        mut license: SoftwareLicense,
        activation_code: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let timestamp = clock::timestamp_ms(clock);
        let user = sender(ctx);

        assert!(license.is_active, ELicenseNotActive);
        assert!(!license.activated, ELicenseAlreadyActivated);

        let provided_hash = hash::sha3_256(activation_code);
        assert!(provided_hash == license.activation_code_hash, EInvalidActivationCode);

        if (license.expiry_date != 0) {
            assert!(timestamp < license.expiry_date, ELicenseExpired);
        };

        assert!(!license.revoked, ELicenseRevoked);

        let license_id = object::id(&license);
        let product_id_copy = license.product_id;

        license.activated = true;
        license.activated_at = timestamp;

        event::emit(LicenseActivated {
            license_id,
            product_id: product_id_copy,
            activated_by: user,
            activated_at: timestamp,
        });

        transfer::public_transfer(license, user);
    }

    /// Verifica licenza
    public fun is_license_valid(license: &SoftwareLicense, clock: &Clock): bool {
        let timestamp = clock::timestamp_ms(clock);

        if (!license.is_active) return false;
        if (!license.activated) return false;
        if (license.revoked) return false;
        if (license.expiry_date != 0 && timestamp >= license.expiry_date) return false;

        true
    }

    /// Revoca una licenza (solo il vendor puo farlo)
    public entry fun revoke_license(
        license: &mut SoftwareLicense,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let caller = sender(ctx);
        let timestamp = clock::timestamp_ms(clock);

        assert!(caller == license.vendor, ENotVendor);

        license.revoked = true;
        license.revoked_at = timestamp;
        license.is_active = false;

        event::emit(LicenseRevoked {
            license_id: object::id(license),
            revoked_by: caller,
            revoked_at: timestamp,
        });
    }
}
