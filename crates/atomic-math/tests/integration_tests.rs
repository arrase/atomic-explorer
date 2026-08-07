use approx::assert_relative_eq;
use atomic_math::{
    grid::evaluate_density_grid_internal,
    probability_density, real_orbital_kind_from_lm, sample_points,
    slater::{calculate_slater_z_eff, get_slater_z_eff_by_name, parse_orbital_designation},
    transition::{calculate_energy_ev, calculate_transition, spectral_series_name},
    wavefunctions::r_nl,
    OrbitalMode, QuantumNumbers, RealOrbitalKind,
};

fn integrate_spherical_density(
    qn: &QuantumNumbers,
    mode: &OrbitalMode,
    z_eff: f64,
    r_start: f64,
    r_max: f64,
    dr: f64,
    dtheta: f64,
    dphi: f64,
) -> f64 {
    let mut integral = 0.0;
    let mut r = r_start;

    while r < r_max {
        let mut theta = 0.0;
        while theta < std::f64::consts::PI {
            let mut phi = 0.0;
            while phi < 2.0 * std::f64::consts::PI {
                let p = probability_density(qn, mode, z_eff, r, theta, phi).unwrap();
                let d_v = r * r * theta.sin() * dr * dtheta * dphi;
                integral += p * d_v;

                phi += dphi;
            }
            theta += dtheta;
        }
        r += dr;
    }

    integral
}

#[test]
fn test_1s_normalization() {
    let qn = QuantumNumbers { n: 1, l: 0, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::S);
    let integral = integrate_spherical_density(&qn, &mode, 1.0, 0.0, 10.0, 0.05, 0.1, 0.1);

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_2p_normalization() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);
    let integral = integrate_spherical_density(&qn, &mode, 1.0, 0.01, 16.0, 0.05, 0.05, 0.1);

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_3d_normalization() {
    let qn = QuantumNumbers { n: 3, l: 2, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Dz2);
    let integral = integrate_spherical_density(&qn, &mode, 1.0, 0.01, 25.0, 0.1, 0.05, 0.1);

    assert_relative_eq!(integral, 1.0, epsilon = 0.05);
}

#[test]
fn test_4f_normalization() {
    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Fz3);
    let integral = integrate_spherical_density(&qn, &mode, 1.0, 0.01, 35.0, 0.15, 0.05, 0.1);

    assert_relative_eq!(integral, 1.0, epsilon = 0.08);
}

#[test]
fn test_1s_analytical_values() {
    let qn = QuantumNumbers { n: 1, l: 0, m: 0 };
    let mode = OrbitalMode::PureEigenstate;

    let p = probability_density(&qn, &mode, 1.0, 1.0, 0.0, 0.0).unwrap();

    let expected = (-2.0_f64).exp() / std::f64::consts::PI;
    assert_relative_eq!(p, expected, epsilon = 1e-6);
}

#[test]
fn test_2pz_analytical_values() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);

    let p = probability_density(&qn, &mode, 1.0, 2.0, 0.0, 0.0).unwrap();

    let expected = (-2.0_f64).exp() / (8.0 * std::f64::consts::PI);
    assert_relative_eq!(p, expected, epsilon = 1e-6);
}

#[test]
fn test_4f_radial_analytical() {
    let r_val = r_nl(4, 3, 1.0, 4.0).unwrap();
    let expected_r = (64.0 / (768.0 * (35.0_f64).sqrt())) * (-1.0_f64).exp();
    assert_relative_eq!(r_val, expected_r, epsilon = 1e-6);
}

#[test]
fn test_4f_density_analytical() {
    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Fz3);
    let p = probability_density(&qn, &mode, 1.0, 4.0, 0.0, 0.0).unwrap();
    assert!(p > 0.0);
}

#[test]
fn test_slater_z_eff_hydrogenic_and_helium() {
    assert_relative_eq!(calculate_slater_z_eff(1, 1, 0).unwrap(), 1.0, epsilon = 1e-5);
    assert_relative_eq!(calculate_slater_z_eff(2, 1, 0).unwrap(), 1.7, epsilon = 1e-5);
}

#[test]
fn test_slater_z_eff_period2_elements() {
    assert_relative_eq!(calculate_slater_z_eff(6, 2, 1).unwrap(), 3.25, epsilon = 1e-5);
    assert_relative_eq!(calculate_slater_z_eff(7, 2, 1).unwrap(), 3.90, epsilon = 1e-5);
    assert_relative_eq!(calculate_slater_z_eff(8, 2, 1).unwrap(), 4.55, epsilon = 1e-5);
}

#[test]
fn test_slater_z_eff_transition_metals() {
    assert_relative_eq!(calculate_slater_z_eff(26, 4, 0).unwrap(), 3.75, epsilon = 1e-5);
    assert_relative_eq!(calculate_slater_z_eff(26, 3, 2).unwrap(), 6.25, epsilon = 1e-5);
}

#[test]
fn test_parse_orbital_designation() {
    assert_eq!(parse_orbital_designation("3d"), Some((3, 2)));
    assert_eq!(parse_orbital_designation(" 4f "), Some((4, 3)));
}

#[test]
fn test_get_slater_z_eff_by_name() {
    assert_relative_eq!(get_slater_z_eff_by_name(6, "2p").unwrap(), 3.25, epsilon = 1e-5);
}

#[test]
fn test_transition_lyman_alpha() {
    let res_lyman = calculate_transition(1.0, 2, 1).unwrap();
    assert_relative_eq!(res_lyman.wavelength_nm, 121.5, epsilon = 0.2);
    assert_eq!(res_lyman.series_name, "Lyman");
    assert_relative_eq!(res_lyman.delta_e_ev, 10.2, epsilon = 0.1);
}

#[test]
fn test_transition_balmer_alpha() {
    let res_balmer = calculate_transition(1.0, 3, 2).unwrap();
    assert_relative_eq!(res_balmer.wavelength_nm, 656.1, epsilon = 0.2);
    assert_eq!(res_balmer.series_name, "Balmer");
    assert_relative_eq!(res_balmer.delta_e_ev, 1.89, epsilon = 0.05);
}

#[test]
fn test_transition_paschen_alpha() {
    let res_paschen = calculate_transition(1.0, 4, 3).unwrap();
    assert_relative_eq!(res_paschen.wavelength_nm, 1875.1, epsilon = 0.5);
    assert_eq!(res_paschen.series_name, "Paschen");
}

#[test]
fn test_spectral_series_name_mapping() {
    assert_eq!(spectral_series_name(1), "Lyman");
    assert_eq!(spectral_series_name(2), "Balmer");
    assert_eq!(spectral_series_name(3), "Paschen");
    assert_eq!(spectral_series_name(4), "Brackett");
    assert_eq!(spectral_series_name(5), "Pfund");
    assert_eq!(spectral_series_name(6), "Humphreys");
}

#[test]
fn test_hydrogenic_energy_ev() {
    let e1 = calculate_energy_ev(1.0, 1).unwrap();
    assert_relative_eq!(e1, -13.605693, epsilon = 1e-4);
}

#[test]
fn test_grid_evaluation() {
    let qn = QuantumNumbers { n: 2, l: 1, m: 0 };
    let mode = OrbitalMode::RealChemist(RealOrbitalKind::Pz);

    let grid_size = 16;
    let grid = evaluate_density_grid_internal(&qn, &mode, 1.0, grid_size, 5.0).unwrap();

    assert_eq!(grid.len(), grid_size * grid_size * grid_size);
    for val in &grid {
        assert!(*val >= 0.0);
    }
}

#[test]
fn test_f_orbital_kind_mapping() {
    assert_eq!(real_orbital_kind_from_lm(3, 0), Some(RealOrbitalKind::Fz3));
    assert_eq!(real_orbital_kind_from_lm(3, 1), Some(RealOrbitalKind::Fxz2));
    assert_eq!(real_orbital_kind_from_lm(3, -1), Some(RealOrbitalKind::Fyz2));
    assert_eq!(real_orbital_kind_from_lm(3, 2), Some(RealOrbitalKind::FzX2Y2));
    assert_eq!(real_orbital_kind_from_lm(3, -2), Some(RealOrbitalKind::Fxyz));
    assert_eq!(real_orbital_kind_from_lm(3, 3), Some(RealOrbitalKind::FxX23Y2));
    assert_eq!(real_orbital_kind_from_lm(3, -3), Some(RealOrbitalKind::Fy3X2Y2));
    assert_eq!(real_orbital_kind_from_lm(4, 0), None);
}

#[test]
fn test_f_orbital_point_sampling() {
    let qn = QuantumNumbers { n: 4, l: 3, m: 0 };
    let mode = OrbitalMode::RealChemist(real_orbital_kind_from_lm(3, 0).unwrap());

    let pts = sample_points(&qn, &mode, 1.0, 50, 123).unwrap();
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

#[test]
fn test_invalid_quantum_numbers() {
    assert!(QuantumNumbers::new(0, 0, 0).is_err());
    assert!(QuantumNumbers::new(2, 2, 0).is_err());
    assert!(QuantumNumbers::new(2, 1, 2).is_err());
}

#[test]
fn test_codata_constants() {
    use atomic_math::math_utils::constants::*;
    assert_relative_eq!(BOHR_RADIUS_NM, 0.05291772109, epsilon = 1e-8);
    assert_relative_eq!(RYDBERG_ENERGY_EV, 13.605693123, epsilon = 1e-6);
    assert_relative_eq!(SPEED_OF_LIGHT, 299792458.0, epsilon = 1e-1);
    assert_relative_eq!(ELEMENTARY_CHARGE, 1.602176634e-19, epsilon = 1e-25);
}

#[test]
fn test_slater_z_eff_heavy_elements() {
    // Uranium Z = 92, 7s orbital (n=7, l=0)
    let z_eff_u_7s = calculate_slater_z_eff(92, 7, 0).unwrap();
    assert!(z_eff_u_7s > 1.0 && z_eff_u_7s < 92.0);

    // Gold Z = 79, 6s orbital (n=6, l=0)
    let z_eff_au_6s = calculate_slater_z_eff(79, 6, 0).unwrap();
    assert!(z_eff_au_6s > 1.0 && z_eff_au_6s < 79.0);
}

#[test]
fn test_high_n_radial_wavefunction_normalization() {
    let qn = QuantumNumbers { n: 5, l: 4, m: 0 };
    let mode = OrbitalMode::PureEigenstate;
    let integral = integrate_spherical_density(&qn, &mode, 1.0, 0.01, 55.0, 0.15, 0.08, 0.1);
    assert_relative_eq!(integral, 1.0, epsilon = 0.08);
}


