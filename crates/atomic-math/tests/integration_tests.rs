use approx::assert_relative_eq;
use atomic_math::{
    grid::evaluate_density_grid_internal,
    probability_density,
    real_orbital_kind_from_lm,
    sample_points,
    slater::{calculate_slater_z_eff, get_slater_z_eff_by_name, parse_orbital_designation},
    transition::{calculate_energy_ev, calculate_transition, spectral_series_name},
    wavefunctions::r_nl,
    OrbitalMode, QuantumNumbers, RealOrbitalKind,
};

#[test]
fn test_1s_normalization() {
    let qn = QuantumNumbers { n: 1, l: 0, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::S);

    let mut integral = 0.0;
    let dr = 0.05;
    let dtheta = 0.1;
    let dphi = 0.1;

    let mut r = 0.0;
    while r < 10.0 {
        let mut theta = 0.0;
        while theta < std::f64::consts::PI {
            let mut phi = 0.0;
            while phi < 2.0 * std::f64::consts::PI {
                let p = probability_density(&qn, &mode, 1.0, r, theta, phi);
                let d_v = r * r * theta.sin() * dr * dtheta * dphi;
                integral += p * d_v;

                phi += dphi;
            }
            theta += dtheta;
        }
        r += dr;
    }

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_2p_normalization() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);

    let mut integral = 0.0;
    let dr = 0.05;
    let dtheta = 0.05;
    let dphi = 0.1;

    let mut r = 0.01;
    while r < 16.0 {
        let mut theta = 0.0;
        while theta < std::f64::consts::PI {
            let mut phi = 0.0;
            while phi < 2.0 * std::f64::consts::PI {
                let p = probability_density(&qn, &mode, 1.0, r, theta, phi);
                let d_v = r * r * theta.sin() * dr * dtheta * dphi;
                integral += p * d_v;

                phi += dphi;
            }
            theta += dtheta;
        }
        r += dr;
    }

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_3d_normalization() {
    let qn = QuantumNumbers { n: 3, l: 2, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Dz2);

    let mut integral = 0.0;
    let dr = 0.1;
    let dtheta = 0.05;
    let dphi = 0.1;

    let mut r = 0.01;
    while r < 25.0 {
        let mut theta = 0.0;
        while theta < std::f64::consts::PI {
            let mut phi = 0.0;
            while phi < 2.0 * std::f64::consts::PI {
                let p = probability_density(&qn, &mode, 1.0, r, theta, phi);
                let d_v = r * r * theta.sin() * dr * dtheta * dphi;
                integral += p * d_v;

                phi += dphi;
            }
            theta += dtheta;
        }
        r += dr;
    }

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_4f_normalization() {
    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Fz3);

    let mut integral = 0.0;
    let dr = 0.15;
    let dtheta = 0.05;
    let dphi = 0.1;

    let mut r = 0.01;
    while r < 35.0 {
        let mut theta = 0.0;
        while theta < std::f64::consts::PI {
            let mut phi = 0.0;
            while phi < 2.0 * std::f64::consts::PI {
                let p = probability_density(&qn, &mode, 1.0, r, theta, phi);
                let d_v = r * r * theta.sin() * dr * dtheta * dphi;
                integral += p * d_v;

                phi += dphi;
            }
            theta += dtheta;
        }
        r += dr;
    }

    assert_relative_eq!(integral, 1.0, epsilon = 0.08);
}

#[test]
fn test_1s_analytical_values() {
    let qn = QuantumNumbers { n: 1, l: 0, m: 0 };
    let mode = OrbitalMode::PureEigenstate;

    let r = 1.0;
    let theta = 0.0;
    let phi = 0.0;
    let z = 1.0;

    let p = probability_density(&qn, &mode, z, r, theta, phi);

    let expected = (-2.0_f64).exp() / std::f64::consts::PI;
    assert_relative_eq!(p, expected, epsilon = 1e-6);
}

#[test]
fn test_2pz_analytical_values() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);

    let r = 2.0;
    let theta = 0.0;
    let phi = 0.0;

    let p = probability_density(&qn, &mode, 1.0, r, theta, phi);

    let expected = (-2.0_f64).exp() / (8.0 * std::f64::consts::PI);
    assert_relative_eq!(p, expected, epsilon = 1e-6);
}

#[test]
fn test_4f_radial_and_density_analytical() {
    let z = 1.0;
    let r = 4.0;
    // R_43(r=4) for Z=1
    // R_43(r) = 1/(768 sqrt(35)) * r^3 * exp(-r/4)
    let r_val = r_nl(4, 3, z, r);
    let expected_r = (64.0 / (768.0 * (35.0_f64).sqrt())) * (-1.0_f64).exp();
    assert_relative_eq!(r_val, expected_r, epsilon = 1e-6);

    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Fz3);
    let p = probability_density(&qn, &mode, z, r, 0.0, 0.0);
    assert!(p > 0.0);
}

#[test]
fn test_slater_z_eff_values() {
    // H 1s
    assert_relative_eq!(calculate_slater_z_eff(1, 1, 0), 1.0, epsilon = 1e-5);
    // He 1s
    assert_relative_eq!(calculate_slater_z_eff(2, 1, 0), 1.7, epsilon = 1e-5);
    // Carbon Z=6, 2p (2s,2p group has 4 electrons; 3 other * 0.35 + 2 * 0.85 = 1.05 + 1.70 = 2.75 -> Z_eff = 3.25)
    assert_relative_eq!(calculate_slater_z_eff(6, 2, 1), 3.25, epsilon = 1e-5);
    // Nitrogen Z=7, 2p (Z_eff = 7 - (4*0.35 + 2*0.85) = 3.90)
    assert_relative_eq!(calculate_slater_z_eff(7, 2, 1), 3.90, epsilon = 1e-5);
    // Oxygen Z=8, 2p (Z_eff = 8 - (5*0.35 + 2*0.85) = 4.55)
    assert_relative_eq!(calculate_slater_z_eff(8, 2, 1), 4.55, epsilon = 1e-5);
    // Iron Z=26, 4s (Z_eff = 3.75)
    assert_relative_eq!(calculate_slater_z_eff(26, 4, 0), 3.75, epsilon = 1e-5);
    // Iron Z=26, 3d (Z_eff = 6.25)
    assert_relative_eq!(calculate_slater_z_eff(26, 3, 2), 6.25, epsilon = 1e-5);

    // Test named parsing
    assert_eq!(parse_orbital_designation("3d"), Some((3, 2)));
    assert_eq!(parse_orbital_designation(" 4f "), Some((4, 3)));
    assert_relative_eq!(get_slater_z_eff_by_name(6, "2p").unwrap(), 3.25, epsilon = 1e-5);
}

#[test]
fn test_transition_calculations() {
    // Hydrogen Lyman-alpha (n=2 -> 1)
    let res_lyman = calculate_transition(1.0, 2, 1).unwrap();
    assert_relative_eq!(res_lyman.wavelength_nm, 121.5, epsilon = 0.2);
    assert_eq!(res_lyman.series_name, "Lyman");
    assert_relative_eq!(res_lyman.delta_e_ev, 10.2, epsilon = 0.1);

    // Hydrogen Balmer-alpha (n=3 -> 2)
    let res_balmer = calculate_transition(1.0, 3, 2).unwrap();
    assert_relative_eq!(res_balmer.wavelength_nm, 656.1, epsilon = 0.2);
    assert_eq!(res_balmer.series_name, "Balmer");
    assert_relative_eq!(res_balmer.delta_e_ev, 1.89, epsilon = 0.05);

    // Hydrogen Paschen-alpha (n=4 -> 3)
    let res_paschen = calculate_transition(1.0, 4, 3).unwrap();
    assert_relative_eq!(res_paschen.wavelength_nm, 1875.1, epsilon = 0.5);
    assert_eq!(res_paschen.series_name, "Paschen");

    // Spectral series names
    assert_eq!(spectral_series_name(1), "Lyman");
    assert_eq!(spectral_series_name(2), "Balmer");
    assert_eq!(spectral_series_name(3), "Paschen");
    assert_eq!(spectral_series_name(4), "Brackett");
    assert_eq!(spectral_series_name(5), "Pfund");
    assert_eq!(spectral_series_name(6), "Humphreys");

    // Energy calculation
    let e1 = calculate_energy_ev(1.0, 1);
    assert_relative_eq!(e1, -13.605693, epsilon = 1e-4);
}

#[test]
fn test_grid_evaluation() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);

    let grid_size = 16;
    let grid = evaluate_density_grid_internal(&qn, &mode, 1.0, grid_size, 5.0);

    assert_eq!(grid.len(), grid_size * grid_size * grid_size);
    for val in &grid {
        assert!(*val >= 0.0);
    }
}

#[test]
fn test_f_orbital_sampling_and_kind_mapping() {
    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(real_orbital_kind_from_lm(3, 0));

    assert_eq!(real_orbital_kind_from_lm(3, 0), RealOrbitalKind::Fz3);
    assert_eq!(real_orbital_kind_from_lm(3, 1), RealOrbitalKind::Fxz2);
    assert_eq!(real_orbital_kind_from_lm(3, -1), RealOrbitalKind::Fyz2);
    assert_eq!(real_orbital_kind_from_lm(3, 2), RealOrbitalKind::FzX2Y2);
    assert_eq!(real_orbital_kind_from_lm(3, -2), RealOrbitalKind::Fxyz);
    assert_eq!(real_orbital_kind_from_lm(3, 3), RealOrbitalKind::FxX23Y2);
    assert_eq!(real_orbital_kind_from_lm(3, -3), RealOrbitalKind::Fy3X2Y2);

    let pts = sample_points(&qn, &mode, 1.0, 50, 123);
    assert_eq!(pts.len(), 50);
}

#[test]
fn test_degeneracy() {
    let n = 4;
    let mut count = 0;
    for l in 0..n {
        for _m in -(l as i32)..=(l as i32) {
            count += 1;
        }
    }
    assert_eq!(count, n * n);
}
