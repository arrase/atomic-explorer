use atomic_math::lcao::{orbital_bond_scale, two_center_overlap, AtomicBasis};
use atomic_math::{evaluate_lcao_curve, evaluate_lcao_state, LCAO_STATE_LEN};

#[test]
fn test_1s_1s_overlap_matches_exact_mulliken() {
    let a = AtomicBasis::new(1, 0, 0, 1.0).unwrap();
    let b = AtomicBasis::new(1, 0, 0, 1.0).unwrap();

    for r in [1.0_f64, 1.4, 3.0, 6.0] {
        let s = two_center_overlap(&a, &b, r).unwrap();
        let exact = (-r).exp() * (1.0 + r + (r * r) / 3.0);
        assert!(
            (s - exact).abs() < 1e-5,
            "1s-1s overlap mismatch at R={r}: got {s}, expected {exact}"
        );
    }
}

#[test]
fn test_2px_2px_pi_overlap_matches_mulliken() {
    let px_a = AtomicBasis::new(2, 1, 1, 1.0).unwrap();
    let px_b = AtomicBasis::new(2, 1, 1, 1.0).unwrap();

    for r in [1.0_f64, 2.0, 4.0, 7.0] {
        let p = 0.5 * r;
        let s = two_center_overlap(&px_a, &px_b, r).unwrap();
        let exact = (-p).exp() * (1.0 + p + 0.4 * p * p + (p * p * p) / 15.0);
        assert!(
            (s - exact).abs() < 1e-4,
            "2px-2px pi overlap mismatch at R={r}: got {s}, expected {exact}"
        );
    }

    let s_1s = AtomicBasis::new(1, 0, 0, 1.0).unwrap();
    let ortho = two_center_overlap(&s_1s, &px_b, 2.0).unwrap();
    assert_eq!(ortho, 0.0);
}

#[test]
fn test_2pz_2pz_sigma_overlap_matches_mulliken() {
    let pz_a = AtomicBasis::new(2, 1, 0, 1.0).unwrap();
    let pz_b = AtomicBasis::new(2, 1, 0, 1.0).unwrap();

    for r in [1.5_f64, 3.0, 5.0, 8.0] {
        let p = 0.5 * r;
        let s = two_center_overlap(&pz_a, &pz_b, r).unwrap();
        let exact =
            (-p).exp() * (-1.0 - p - 0.2 * p * p + (2.0 / 15.0) * p.powi(3) + p.powi(4) / 15.0);
        assert!(
            (s - exact).abs() < 1e-4,
            "2pz-2pz sigma overlap mismatch at R={r}: got {s}, expected {exact}"
        );
    }
}

#[test]
fn test_secular_normalization_and_polar_shift() {
    let homo = evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, 1.0, 1.4).unwrap();
    assert_eq!(homo.len(), LCAO_STATE_LEN);

    let s_homo = homo[0];
    let norm_bond_homo = homo[1] * homo[1] + homo[2] * homo[2] + 2.0 * s_homo * homo[1] * homo[2];
    let norm_anti_homo = homo[3] * homo[3] + homo[4] * homo[4] + 2.0 * s_homo * homo[3] * homo[4];
    assert!((norm_bond_homo - 1.0).abs() < 1e-12);
    assert!((norm_anti_homo - 1.0).abs() < 1e-12);
    assert!((homo[5] - 0.5).abs() < 1e-12);
    assert!((homo[6] - 0.5).abs() < 1e-12);
    assert!(homo[9] < homo[7]);
    assert!(homo[10] > homo[7]);
    assert!(homo[15] >= 1e-4);
    assert_eq!(homo[16], 0.0);

    let hetero = evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, 1.85, 1.4).unwrap();
    let s_het = hetero[0];
    let norm_bond_het =
        hetero[1] * hetero[1] + hetero[2] * hetero[2] + 2.0 * s_het * hetero[1] * hetero[2];
    let norm_anti_het =
        hetero[3] * hetero[3] + hetero[4] * hetero[4] + 2.0 * s_het * hetero[3] * hetero[4];
    assert!((norm_bond_het - 1.0).abs() < 1e-12);
    assert!((norm_anti_het - 1.0).abs() < 1e-12);
    assert!(
        hetero[6] > 0.70,
        "Expected share_b_bond > 0.70, got {}",
        hetero[6]
    );
    assert!((hetero[5] + hetero[6] - 1.0).abs() < 1e-12);
    assert!(hetero[16].is_finite() && hetero[16] > 0.0);

    let hetero_px = evaluate_lcao_state(2, 1, 1, 3.25, 2, 1, 1, 3.90, 2.2).unwrap();
    assert!(hetero_px[16].is_finite());
    let hetero_py = evaluate_lcao_state(2, 1, -1, 3.25, 2, 1, -1, 3.90, 2.2).unwrap();
    assert!(hetero_py[16].is_finite());
}

#[test]
fn test_potential_curve_equilibrium_and_asymptote() {
    let h2_eq = evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, 1.0, 1.401).unwrap();
    let r_eq = h2_eq[13];
    let d_e = h2_eq[14];
    assert!((r_eq - 1.401).abs() < 1e-9);
    assert!((d_e - 4.75).abs() < 0.15, "Unexpected H2 D_e: {d_e}");
    assert!((h2_eq[11] - (-d_e)).abs() < 1e-12);
    assert!(h2_eq[12] > 0.0);

    let h2_far = evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, 1.0, 15.0).unwrap();
    assert!(h2_far[11].abs() < 1e-2);
    assert!(h2_far[12] > 0.0);

    let steps = 120usize;
    let curve = evaluate_lcao_curve(1, 0, 0, 1.0, 1, 0, 0, 1.0, 0.6, 10.0, steps).unwrap();
    assert_eq!(curve.len(), (steps + 1) * 3);
    for chunk in curve.as_chunks::<3>().0 {
        assert!(chunk[0] >= 0.6 && chunk[0] <= 10.0);
        assert!(chunk[2] > 0.0, "Antibonding curve must remain repulsive");
    }

    assert!((orbital_bond_scale(3, 0, 0) - 6.3).abs() < 1e-12);
    let _ = evaluate_lcao_state(2, 1, 0, 3.9, 2, 1, 0, 3.9, 2.1).unwrap();

    assert!(evaluate_lcao_state(0, 0, 0, 1.0, 1, 0, 0, 1.0, 1.4).is_err());
    assert!(evaluate_lcao_state(1, 1, 0, 1.0, 1, 0, 0, 1.0, 1.4).is_err());
    assert!(evaluate_lcao_state(5, 4, 0, 1.0, 1, 0, 0, 1.0, 1.4).is_err());
    assert!(evaluate_lcao_state(1, 0, 0, 0.0, 1, 0, 0, 1.0, 1.4).is_err());
    assert!(evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, -1.0, 1.4).is_err());
    assert!(evaluate_lcao_state(1, 0, 0, 1.0, 1, 0, 0, 1.0, 0.19).is_err());
    assert!(evaluate_lcao_curve(1, 0, 0, 1.0, 1, 0, 0, 1.0, 0.1, 10.0, 50).is_err());
    assert!(evaluate_lcao_curve(1, 0, 0, 1.0, 1, 0, 0, 1.0, 5.0, 5.0, 50).is_err());
    assert!(evaluate_lcao_curve(1, 0, 0, 1.0, 1, 0, 0, 1.0, 0.6, 10.0, 0).is_err());
}
