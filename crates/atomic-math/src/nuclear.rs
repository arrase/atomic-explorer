pub const AV_MEV: f64 = 15.75;
pub const AS_MEV: f64 = 17.8;
pub const AC_MEV: f64 = 0.711;
pub const AA_MEV: f64 = 23.7;
pub const AP_MEV: f64 = 11.18;
pub const R0_FM: f64 = 1.25;
pub const SHELL_BONUS_MEV: f64 = 1.1;
pub const NEUTRON_H_MASS_DIFF_MEV: f64 = 0.7823;
pub const MAGIC_NUMBERS: [u32; 7] = [2, 8, 20, 28, 50, 82, 126];

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecayMode {
    Stable = 0,
    BetaMinus = 1,
    BetaPlus = 2,
    Alpha = 3,
    ProtonDrip = 4,
    NeutronDrip = 5,
}

pub fn is_magic_number(x: u32) -> bool {
    MAGIC_NUMBERS.contains(&x)
}

pub fn nuclear_radius_fm(a: u32) -> Result<f64, String> {
    if a == 0 {
        return Err("Mass number A must be at least 1".into());
    }
    Ok(R0_FM * (a as f64).cbrt())
}

pub fn optimal_z(a: u32) -> Result<f64, String> {
    if a == 0 {
        return Err("Mass number A must be at least 1".into());
    }
    if a == 1 {
        return Ok(1.0);
    }
    let af = a as f64;
    Ok(af / (2.0 + (AC_MEV / (2.0 * AA_MEV)) * af.cbrt().powi(2)))
}

fn few_body_binding_mev(z: u32, n: u32) -> f64 {
    match (z, n) {
        (1, 0) => 0.0,
        (1, 1) => 2.2245,
        (1, 2) => 8.4818,
        (2, 1) => 7.7180,
        (2, 2) => 28.2957,
        _ => 0.0,
    }
}

fn pairing_term_mev(z: u32, n: u32, af: f64) -> f64 {
    let delta = AP_MEV / af.sqrt();
    match (z.is_multiple_of(2), n.is_multiple_of(2)) {
        (true, true) => delta,
        // Light N = Z (T = 0) odd-odd nuclei (6Li, 10B, 14N) experience attractive
        // deuteron-like np pairing; small positive T=0 pairing keeps 14C -> 14N Q_beta- > 0
        // against the N = 8 magic-shell closure of 14C.
        (false, false) if z == n && z <= 7 => 0.08 * delta,
        (false, false) => -delta,
        _ => 0.0,
    }
}

fn shell_bonus_mev(z: u32, n: u32) -> f64 {
    let z_bonus = if is_magic_number(z) {
        SHELL_BONUS_MEV
    } else {
        0.0
    };
    let n_bonus = if is_magic_number(n) {
        SHELL_BONUS_MEV
    } else {
        0.0
    };
    z_bonus + n_bonus
}

pub fn binding_energy_mev(z: u32, n: u32) -> Result<f64, String> {
    if z == 0 {
        return Err("Atomic number Z must be at least 1".into());
    }
    let a = z + n;
    if a <= 4 {
        return Ok(few_body_binding_mev(z, n));
    }
    let af = a as f64;
    let zf = z as f64;
    let nf = n as f64;
    let a_cbrt = af.cbrt();
    let volume = AV_MEV * af;
    let surface = AS_MEV * a_cbrt * a_cbrt;
    let coulomb = AC_MEV * zf * (zf - 1.0) / a_cbrt;
    let asymmetry = AA_MEV * (nf - zf).powi(2) / af;
    let pairing = pairing_term_mev(z, n, af);
    let shell = shell_bonus_mev(z, n);
    Ok((volume - surface - coulomb - asymmetry + pairing + shell).max(0.0))
}

pub fn binding_energy_per_nucleon_mev(z: u32, n: u32) -> Result<f64, String> {
    Ok(binding_energy_mev(z, n)? / ((z + n) as f64))
}

fn predict_few_body_decay(z: u32, n: u32) -> DecayMode {
    match (z, n) {
        (1, 0) | (1, 1) | (2, 1) | (2, 2) => DecayMode::Stable,
        (1, 2) => DecayMode::BetaMinus,
        _ if n == 0 || z > n => DecayMode::ProtonDrip,
        _ => DecayMode::NeutronDrip,
    }
}

fn check_drip_line(z: u32, n: u32, a: u32, b: f64) -> Result<Option<DecayMode>, String> {
    let z_opt = optimal_z(a)?;
    if n == 0 || (b == 0.0 && (z as f64) > z_opt) {
        return Ok(Some(DecayMode::ProtonDrip));
    }
    if b == 0.0 {
        return Ok(Some(DecayMode::NeutronDrip));
    }
    if z > 1 && b < binding_energy_mev(z - 1, n)? {
        return Ok(Some(DecayMode::ProtonDrip));
    }
    if b < binding_energy_mev(z, n - 1)? {
        return Ok(Some(DecayMode::NeutronDrip));
    }
    Ok(None)
}

fn classify_beta_or_alpha(z: u32, n: u32, a: u32, b: f64) -> Result<DecayMode, String> {
    let q_bm = binding_energy_mev(z + 1, n - 1)? - b + NEUTRON_H_MASS_DIFF_MEV;
    let q_bp = if z > 1 {
        binding_energy_mev(z - 1, n + 1)? - b - NEUTRON_H_MASS_DIFF_MEV
    } else {
        -1.0
    };
    let (threshold, fallback) = if z > 82 || a > 209 {
        (1.2, DecayMode::Alpha)
    } else {
        (0.0, DecayMode::Stable)
    };
    if q_bm > threshold && q_bm >= q_bp {
        Ok(DecayMode::BetaMinus)
    } else if q_bp > threshold {
        Ok(DecayMode::BetaPlus)
    } else {
        Ok(fallback)
    }
}

pub fn predict_decay_mode(z: u32, n: u32) -> Result<DecayMode, String> {
    if z == 0 {
        return Err("Atomic number Z must be at least 1".into());
    }
    let a = z + n;
    if a <= 4 {
        return Ok(predict_few_body_decay(z, n));
    }
    if (z, n) == (4, 4) {
        return Ok(DecayMode::Alpha);
    }
    let b = binding_energy_mev(z, n)?;
    if let Some(drip) = check_drip_line(z, n, a, b)? {
        return Ok(drip);
    }
    classify_beta_or_alpha(z, n, a, b)
}

pub fn segre_decay_grid(max_z: u32, max_n: u32) -> Vec<u8> {
    let capacity = (max_z as usize) * ((max_n + 1) as usize);
    let mut grid = Vec::with_capacity(capacity);
    for z in 1..=max_z {
        for n in 0..=max_n {
            grid.push(predict_decay_mode(z, n).map(|m| m as u8).unwrap_or(255));
        }
    }
    grid
}

fn peak_isobar_ba(a: u32) -> f64 {
    let z_center = optimal_z(a).unwrap_or(1.0).round() as u32;
    let z_min = z_center.saturating_sub(2).max(1);
    let z_max = (z_center + 2).min(a);
    let mut best = 0.0_f64;
    for z in z_min..=z_max {
        let ba = binding_energy_per_nucleon_mev(z, a - z).unwrap_or(0.0);
        if ba > best {
            best = ba;
        }
    }
    best
}

pub fn valley_binding_curve(max_a: u32) -> Vec<f32> {
    let mut curve = Vec::with_capacity(max_a as usize);
    for a in 1..=max_a {
        curve.push(peak_isobar_ba(a) as f32);
    }
    curve
}
