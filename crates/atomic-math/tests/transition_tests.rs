use approx::assert_relative_eq;
use atomic_math::transition::{
    calculate_energy_ev, calculate_transition, is_dipole_allowed, radial_dipole_integral,
    spectral_series_name, spontaneous_emission_rate,
};
use atomic_math::{
    calculate_radial_dipole_integral, calculate_spontaneous_emission_rate,
    calculate_transition_wavelength, is_dipole_transition_allowed,
};

#[test]
fn test_calculate_energy_ev() {
    let e1_h = calculate_energy_ev(1.0, 1).unwrap();
    assert_relative_eq!(e1_h, -13.605_693, epsilon = 1e-5);

    let e2_h = calculate_energy_ev(1.0, 2).unwrap();
    assert_relative_eq!(e2_h, -3.401_423, epsilon = 1e-5);

    let e1_he_plus = calculate_energy_ev(2.0, 1).unwrap();
    assert_relative_eq!(e1_he_plus, -54.422_772, epsilon = 1e-5);

    assert!(calculate_energy_ev(1.0, 0).is_err());
    assert!(calculate_energy_ev(0.0, 1).is_err());
    assert!(calculate_energy_ev(-1.5, 1).is_err());
}

#[test]
fn test_calculate_transition_and_wavelengths() {
    let ly_alpha = calculate_transition(1.0, 2, 1).unwrap();
    assert_relative_eq!(ly_alpha.wavelength_nm, 121.502, epsilon = 1e-3);
    assert_eq!(ly_alpha.series_name, "Lyman");
    assert_relative_eq!(
        ly_alpha.delta_e_ev,
        (ly_alpha.energy_final_ev - ly_alpha.energy_initial_ev).abs(),
        epsilon = 1e-12
    );

    let h_alpha = calculate_transition(1.0, 3, 2).unwrap();
    assert_relative_eq!(h_alpha.wavelength_nm, 656.112, epsilon = 1e-3);
    assert_eq!(h_alpha.series_name, "Balmer");

    let h_beta = calculate_transition(1.0, 4, 2).unwrap();
    assert_relative_eq!(h_beta.wavelength_nm, 486.009, epsilon = 1e-3);
    assert_eq!(h_beta.series_name, "Balmer");

    let pa_alpha = calculate_transition(1.0, 4, 3).unwrap();
    assert_relative_eq!(pa_alpha.wavelength_nm, 1874.606, epsilon = 1e-3);
    assert_eq!(pa_alpha.series_name, "Paschen");

    // Symmetry under n1 <-> n2 (emission vs absorption)
    let absorb = calculate_transition(1.0, 2, 3).unwrap();
    assert_relative_eq!(absorb.wavelength_nm, h_alpha.wavelength_nm, epsilon = 1e-12);
    assert_relative_eq!(absorb.delta_e_ev, h_alpha.delta_e_ev, epsilon = 1e-12);
    assert_eq!(absorb.series_name, h_alpha.series_name);
    assert_relative_eq!(
        calculate_transition_wavelength(1.0, 2, 3).unwrap(),
        calculate_transition_wavelength(1.0, 3, 2).unwrap(),
        epsilon = 1e-12
    );

    // Error paths
    assert!(calculate_transition(1.0, 0, 2).is_err());
    assert!(calculate_transition(1.0, 2, 0).is_err());
    assert!(calculate_transition(1.0, 2, 2).is_err());
    assert!(calculate_transition(0.0, 1, 2).is_err());
    assert!(calculate_transition(-1.0, 1, 2).is_err());
    assert!(calculate_transition_wavelength(1.0, 3, 3).is_err());
    assert!(calculate_transition_wavelength(0.0, 1, 2).is_err());
}

#[test]
fn test_all_spectral_series_names() {
    let expected = [
        (1, "Lyman"),
        (2, "Balmer"),
        (3, "Paschen"),
        (4, "Brackett"),
        (5, "Pfund"),
        (6, "Humphreys"),
        (7, "Higher"),
        (10, "Higher"),
    ];

    for (n_lower, name) in expected {
        assert_eq!(spectral_series_name(n_lower), name);
        let res = calculate_transition(1.0, n_lower, n_lower + 1).unwrap();
        assert_eq!(res.series_name, name);
    }
}

#[test]
fn test_dipole_selection_rules() {
    // Allowed: Δl = ±1 and |Δm| <= 1
    assert!(is_dipole_transition_allowed(0, 0, 1, 0));
    assert!(is_dipole_transition_allowed(0, 0, 1, 1));
    assert!(is_dipole_transition_allowed(0, 0, 1, -1));
    assert!(is_dipole_transition_allowed(2, 1, 1, 0));
    assert!(is_dipole_allowed(1, -1, 2, -2));

    // Forbidden: Δl = 0 (2s -> 1s)
    assert!(!is_dipole_transition_allowed(0, 0, 0, 0));
    assert!(!is_dipole_transition_allowed(1, 0, 1, 0));

    // Forbidden: |Δl| = 2 (3d -> 1s)
    assert!(!is_dipole_transition_allowed(2, 0, 0, 0));
    assert!(!is_dipole_transition_allowed(0, 0, 2, 0));

    // Forbidden: |Δm| = 2 (3d_{m=2} -> 2p_{m=0})
    assert!(!is_dipole_transition_allowed(2, 2, 1, 0));
    assert!(!is_dipole_transition_allowed(1, 0, 2, -2));
}

#[test]
fn test_radial_dipole_integral() {
    // Analytical <2p | r | 1s> = (128 * sqrt(6) / 243) a0 ≈ 1.290266195 a0
    let expected_2p_1s = (128.0 * 6.0_f64.sqrt()) / 243.0;
    let r_h = calculate_radial_dipole_integral(1, 0, 2, 1, 1.0).unwrap();
    assert_relative_eq!(r_h, expected_2p_1s, epsilon = 1e-5);

    // Symmetric order <1s | r | 2p>
    let r_h_sym = radial_dipole_integral(2, 1, 1, 0, 1.0).unwrap();
    assert_relative_eq!(r_h_sym, expected_2p_1s, epsilon = 1e-5);

    // 1/Z scaling for He+ (Z = 2)
    let r_he = calculate_radial_dipole_integral(1, 0, 2, 1, 2.0).unwrap();
    assert_relative_eq!(r_he, expected_2p_1s / 2.0, epsilon = 1e-5);

    // Forbidden transitions yield 0.0
    assert_relative_eq!(
        calculate_radial_dipole_integral(1, 0, 2, 0, 1.0).unwrap(),
        0.0,
        epsilon = 1e-12
    );
    assert_relative_eq!(
        calculate_radial_dipole_integral(1, 0, 3, 2, 1.0).unwrap(),
        0.0,
        epsilon = 1e-12
    );

    // Invalid quantum numbers and Z_eff <= 0 errors
    assert!(calculate_radial_dipole_integral(1, 1, 2, 0, 1.0).is_err());
    assert!(calculate_radial_dipole_integral(1, 0, 2, 2, 1.0).is_err());
    assert!(calculate_radial_dipole_integral(0, 0, 2, 1, 1.0).is_err());
    assert!(calculate_radial_dipole_integral(1, 0, 2, 1, 0.0).is_err());
    assert!(calculate_radial_dipole_integral(1, 0, 2, 0, -1.0).is_err());
    assert!(radial_dipole_integral(1, 0, 2, 0, 0.0).is_err());
}

#[test]
fn test_spontaneous_emission_rate() {
    // Hydrogen Lyman-alpha A_{2p -> 1s}(Z = 1) ≈ 6.2649e8 s^-1
    let a_h = calculate_spontaneous_emission_rate(1.0, 1, 0, 2, 1).unwrap();
    assert_relative_eq!(a_h, 6.2649e8, max_relative = 1e-3);

    // Z^4 scaling: A_{2p -> 1s}(Z = 2) = 16 * A_{2p -> 1s}(Z = 1)
    let a_he = calculate_spontaneous_emission_rate(2.0, 1, 0, 2, 1).unwrap();
    assert_relative_eq!(a_he, 16.0 * a_h, max_relative = 1e-5);

    // Forbidden 2s -> 1s and 3d -> 1s return 0.0
    assert_relative_eq!(
        calculate_spontaneous_emission_rate(1.0, 1, 0, 2, 0).unwrap(),
        0.0,
        epsilon = 1e-12
    );
    assert_relative_eq!(
        spontaneous_emission_rate(1.0, 1, 0, 3, 2).unwrap(),
        0.0,
        epsilon = 1e-12
    );

    // Error cases: n2 <= n1, invalid quantum numbers, z_eff <= 0
    assert!(calculate_spontaneous_emission_rate(1.0, 2, 1, 1, 0).is_err());
    assert!(calculate_spontaneous_emission_rate(1.0, 2, 0, 2, 1).is_err());
    assert!(calculate_spontaneous_emission_rate(1.0, 1, 1, 2, 0).is_err());
    assert!(calculate_spontaneous_emission_rate(1.0, 1, 0, 2, 2).is_err());
    assert!(calculate_spontaneous_emission_rate(0.0, 1, 0, 2, 1).is_err());
    assert!(calculate_spontaneous_emission_rate(-1.0, 1, 0, 2, 0).is_err());
}
