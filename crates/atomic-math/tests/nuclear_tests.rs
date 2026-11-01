use atomic_math::nuclear::{
    binding_energy_mev, binding_energy_per_nucleon_mev, is_magic_number, nuclear_radius_fm,
    optimal_z, predict_decay_mode, segre_decay_grid, valley_binding_curve, DecayMode,
    MAGIC_NUMBERS,
};
use atomic_math::{
    evaluate_segre_grid, evaluate_valley_ba_curve, get_nuclear_binding_energy,
    get_nuclear_binding_per_nucleon, get_nuclear_optimal_z, get_nuclear_radius_fm,
    predict_nuclear_decay,
};

#[test]
fn test_magic_numbers_and_nuclear_radius_scaling() {
    for &m in &MAGIC_NUMBERS {
        assert!(is_magic_number(m), "Expected {m} to be magic");
    }
    for non_magic in [1, 6, 14, 26, 92] {
        assert!(
            !is_magic_number(non_magic),
            "Expected {non_magic} not magic"
        );
    }

    assert!((nuclear_radius_fm(1).unwrap() - 1.25).abs() < 1e-12);
    assert!((nuclear_radius_fm(8).unwrap() - 2.50).abs() < 1e-12);
    assert!((nuclear_radius_fm(27).unwrap() - 3.75).abs() < 1e-12);
    assert!((nuclear_radius_fm(64).unwrap() - 5.00).abs() < 1e-12);
    assert!((get_nuclear_radius_fm(64).unwrap() - 5.00).abs() < 1e-12);
}

#[test]
fn test_few_body_and_semf_binding_benchmarks() {
    assert_eq!(get_nuclear_binding_energy(1, 0).unwrap(), 0.0);
    assert!((get_nuclear_binding_energy(1, 1).unwrap() - 2.2245).abs() < 1e-9);
    assert!((binding_energy_mev(1, 2).unwrap() - 8.4818).abs() < 1e-9);
    assert!((binding_energy_mev(2, 1).unwrap() - 7.7180).abs() < 1e-9);
    assert!((get_nuclear_binding_per_nucleon(2, 2).unwrap() - 7.073925).abs() < 1e-5);
    assert_eq!(binding_energy_mev(3, 0).unwrap(), 0.0);

    // Medium, doubly-magic, and heavy nuclei within < 1.5% of experiment
    for (z, n, exp_b) in [
        (8, 8, 127.619),
        (26, 30, 492.254),
        (82, 126, 1636.43),
        (92, 146, 1801.69),
    ] {
        let semf_b = get_nuclear_binding_energy(z, n).unwrap();
        let rel_err = (semf_b - exp_b).abs() / exp_b;
        assert!(
            rel_err < 0.015,
            "SEMF error too high for Z={z}, N={n}: got {semf_b}, exp {exp_b} (err={rel_err})"
        );
    }

    // Light alpha-cluster 12C, odd-A 13C, and iron peak ordering
    let ba_c12 = binding_energy_per_nucleon_mev(6, 6).unwrap();
    let ba_c13 = binding_energy_per_nucleon_mev(6, 7).unwrap();
    let ba_fe56 = get_nuclear_binding_per_nucleon(26, 30).unwrap();
    let ba_u235 = binding_energy_per_nucleon_mev(92, 143).unwrap();
    assert!((ba_c12 - 7.468).abs() < 0.05);
    assert!(ba_c13 > 7.3 && ba_c13 < ba_fe56);
    assert!((ba_fe56 - 8.85).abs() < 0.05);
    assert!(ba_fe56 > ba_c12 && ba_fe56 > ba_u235);
}

#[test]
fn test_valley_of_stability_optimal_z() {
    assert_eq!(optimal_z(1).unwrap(), 1.0);
    let z4 = get_nuclear_optimal_z(4).unwrap();
    let z56 = get_nuclear_optimal_z(56).unwrap();
    let z208 = get_nuclear_optimal_z(208).unwrap();

    assert!((z4 - 1.96).abs() < 0.02, "Unexpected Z_opt(4): {z4}");
    assert!((z56 - 25.23).abs() < 0.05, "Unexpected Z_opt(56): {z56}");
    assert!((z208 - 82.32).abs() < 0.05, "Unexpected Z_opt(208): {z208}");
    assert!(
        208.0 - z208 > z208,
        "Heavy nuclei must satisfy N_opt > Z_opt"
    );
}

#[test]
fn test_all_six_decay_modes() {
    for (z, n) in [(1, 0), (2, 2), (6, 6), (7, 7), (8, 8), (26, 30), (82, 126)] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::Stable,
            "Expected ({z}, {n}) Stable"
        );
        assert_eq!(
            predict_nuclear_decay(z, n).unwrap(),
            DecayMode::Stable as u8
        );
    }

    for (z, n) in [(1, 2), (6, 8), (27, 33), (53, 78), (55, 82), (83, 137)] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::BetaMinus,
            "Expected ({z}, {n}) BetaMinus"
        );
    }

    for (z, n) in [(8, 6), (9, 9), (86, 120)] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::BetaPlus,
            "Expected ({z}, {n}) BetaPlus"
        );
    }

    for (z, n) in [
        (4, 4),
        (84, 126),
        (88, 138),
        (92, 143),
        (92, 146),
        (95, 146),
    ] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::Alpha,
            "Expected ({z}, {n}) Alpha"
        );
    }

    for (z, n) in [(2, 0), (8, 1), (10, 0), (20, 2)] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::ProtonDrip,
            "Expected ({z}, {n}) ProtonDrip"
        );
    }

    for (z, n) in [(1, 3), (2, 8), (6, 22), (6, 30)] {
        assert_eq!(
            predict_decay_mode(z, n).unwrap(),
            DecayMode::NeutronDrip,
            "Expected ({z}, {n}) NeutronDrip"
        );
    }
}

#[test]
fn test_error_handling_for_zero_inputs() {
    assert!(nuclear_radius_fm(0).is_err());
    assert!(get_nuclear_radius_fm(0).is_err());
    assert!(optimal_z(0).is_err());
    assert!(get_nuclear_optimal_z(0).is_err());
    assert!(binding_energy_mev(0, 1).is_err());
    assert!(binding_energy_per_nucleon_mev(0, 1).is_err());
    assert!(predict_decay_mode(0, 1).is_err());
    assert!(get_nuclear_binding_energy(0, 1).is_err());
    assert!(get_nuclear_binding_per_nucleon(0, 1).is_err());
    assert!(predict_nuclear_decay(0, 1).is_err());
}

#[test]
fn test_segre_grid_and_valley_ba_curve_shapes() {
    let grid = evaluate_segre_grid(118, 180);
    assert_eq!(grid.len(), 118 * 181);
    assert_eq!(grid.len(), segre_decay_grid(118, 180).len());

    let idx = |z: u32, n: u32| ((z - 1) * 181 + n) as usize;
    assert_eq!(grid[idx(1, 0)], DecayMode::Stable as u8);
    assert_eq!(grid[idx(6, 8)], DecayMode::BetaMinus as u8);
    assert_eq!(grid[idx(26, 30)], DecayMode::Stable as u8);
    assert_eq!(grid[idx(92, 146)], DecayMode::Alpha as u8);
    assert_eq!(grid[idx(8, 1)], DecayMode::ProtonDrip as u8);
    assert_eq!(grid[idx(6, 22)], DecayMode::NeutronDrip as u8);

    let curve = evaluate_valley_ba_curve(250);
    assert_eq!(curve.len(), 250);
    assert_eq!(curve.len(), valley_binding_curve(250).len());

    let (peak_idx, &peak_ba) = curve
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .unwrap();
    let peak_a = peak_idx + 1;
    assert!(
        (56..=62).contains(&peak_a),
        "Expected valley B/A curve peak in A=56..=62, got A={peak_a}"
    );
    assert!(peak_ba > 8.8 && peak_ba < 9.0);
}
