#[derive(Debug, Clone, PartialEq)]
pub struct TransitionResult {
    pub energy_initial_ev: f64,
    pub energy_final_ev: f64,
    pub delta_e_ev: f64,
    pub wavelength_nm: f64,
    pub series_name: String,
}

use crate::math_utils::constants::{RYDBERG_CONST_M1, RYDBERG_ENERGY_EV};

pub const RYDBERG_EV: f64 = RYDBERG_ENERGY_EV;
/// Reciprocal Rydberg constant in nm: 1 / (R_∞ * 1e-9) = 91.12670505824 nm
pub const RYDBERG_NM_FACTOR: f64 = 1.0e9 / RYDBERG_CONST_M1;

/// Calculate hydrogenic energy level E_n in eV given Z_eff and n.
pub fn calculate_energy_ev(z_eff: f64, n: u32) -> Result<f64, String> {
    if n == 0 {
        return Err("Principal quantum number n must be greater than 0".into());
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }
    let n_f = n as f64;
    Ok(-RYDBERG_EV * z_eff * z_eff / (n_f * n_f))
}

/// Identify the spectral series based on the lower principal quantum number n_lower.
pub fn spectral_series_name(n_lower: u32) -> &'static str {
    match n_lower {
        1 => "Lyman",
        2 => "Balmer",
        3 => "Paschen",
        4 => "Brackett",
        5 => "Pfund",
        6 => "Humphreys",
        _ => "Higher",
    }
}

/// Calculate transition energy levels, delta E (eV), wavelength (nm), and spectral series.
pub fn calculate_transition(z_eff: f64, n1: u32, n2: u32) -> Result<TransitionResult, String> {
    if n1 == 0 || n2 == 0 {
        return Err("Principal quantum number n must be greater than 0".into());
    }
    if n1 == n2 {
        return Err("Initial and final quantum numbers must be different".into());
    }
    if z_eff <= 0.0 {
        return Err(format!("Effective nuclear charge Z_eff ({}) must be positive", z_eff));
    }

    let e1 = calculate_energy_ev(z_eff, n1)?;
    let e2 = calculate_energy_ev(z_eff, n2)?;
    let delta_e = (e2 - e1).abs();

    let n_min = n1.min(n2);
    let n_max = n1.max(n2);

    let inv_n_sq_diff = (1.0 / ((n_min * n_min) as f64)) - (1.0 / ((n_max * n_max) as f64));
    let wavelength_nm = RYDBERG_NM_FACTOR / (z_eff * z_eff * inv_n_sq_diff);

    let series_name = spectral_series_name(n_min).to_string();

    Ok(TransitionResult {
        energy_initial_ev: e1,
        energy_final_ev: e2,
        delta_e_ev: delta_e,
        wavelength_nm,
        series_name,
    })
}

/// Check electric dipole selection rules for transitions between states (l1, m1) and (l2, m2).
/// Selection rules: Δl = ±1, Δm = 0 or ±1.
pub fn is_dipole_allowed(l1: u32, m1: i32, l2: u32, m2: i32) -> bool {
    let delta_l = (l1 as i64 - l2 as i64).abs();
    let delta_m = (m1 as i64 - m2 as i64).abs();
    delta_l == 1 && delta_m <= 1
}

/// Calculate radial dipole moment integral <n2, l2 | r | n1, l1> in atomic units (Bohr radii a_0).
pub fn radial_dipole_integral(
    n1: u32,
    l1: u32,
    n2: u32,
    l2: u32,
    z_eff: f64,
) -> Result<f64, String> {
    use crate::wavefunctions::r_nl;

    if !is_dipole_allowed(l1, 0, l2, 0) {
        return Ok(0.0);
    }

    let max_n = n1.max(n2) as f64;
    let r_max = 12.0 * max_n * max_n / z_eff;
    let steps = 4000;
    let h = r_max / (steps as f64);

    let f = |r: f64| -> Result<f64, String> {
        let r1 = r_nl(n1, l1, z_eff, r)?;
        let r2 = r_nl(n2, l2, z_eff, r)?;
        Ok(r1 * r2 * r * r * r)
    };

    let mut sum = f(0.0)? + f(r_max)?;
    for i in 1..steps {
        let r = (i as f64) * h;
        let fi = f(r)?;
        if i % 2 == 1 {
            sum += 4.0 * fi;
        } else {
            sum += 2.0 * fi;
        }
    }

    Ok(sum * h / 3.0)
}

/// Calculate Einstein A_21 coefficient for spontaneous emission rate (in s^-1) for transition n2 -> n1.
pub fn spontaneous_emission_rate(
    z_eff: f64,
    n1: u32,
    l1: u32,
    n2: u32,
    l2: u32,
) -> Result<f64, String> {
    use crate::math_utils::constants::*;

    if n2 <= n1 {
        return Err("Upper level n2 must be greater than lower level n1 for emission".into());
    }
    if (l1 as i64 - l2 as i64).abs() != 1 {
        return Ok(0.0);
    }

    let e1 = calculate_energy_ev(z_eff, n1)?;
    let e2 = calculate_energy_ev(z_eff, n2)?;
    let delta_e_j = (e2 - e1) * ELEMENTARY_CHARGE; // Energy difference in Joules
    let omega = delta_e_j / HBAR; // Angular frequency rad/s

    let r_int_bohr = radial_dipole_integral(n1, l1, n2, l2, z_eff)?;
    let r_int_m = r_int_bohr * BOHR_RADIUS_M;

    let l_max = l1.max(l2) as f64;
    let l2_f = l2 as f64;
    let line_strength = l_max / (2.0 * l2_f + 1.0);

    let prefactor = (4.0 * omega.powi(3) * ELEMENTARY_CHARGE.powi(2) * COULOMB_CONST)
        / (3.0 * HBAR * SPEED_OF_LIGHT.powi(3));

    Ok(prefactor * line_strength * r_int_m * r_int_m)
}

