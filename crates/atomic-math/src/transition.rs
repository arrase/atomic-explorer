use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransitionResult {
    pub energy_initial_ev: f64,
    pub energy_final_ev: f64,
    pub delta_e_ev: f64,
    pub wavelength_nm: f64,
    pub series_name: String,
}

pub const RYDBERG_EV: f64 = 13.605693122994;
pub const RYDBERG_NM_FACTOR: f64 = 91.126705;

/// Calculate hydrogenic energy level E_n in eV given Z_eff and n.
pub fn calculate_energy_ev(z_eff: f64, n: u32) -> f64 {
    if n == 0 {
        return 0.0;
    }
    let n_f = n as f64;
    -RYDBERG_EV * z_eff * z_eff / (n_f * n_f)
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

    let e1 = calculate_energy_ev(z_eff, n1);
    let e2 = calculate_energy_ev(z_eff, n2);
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
