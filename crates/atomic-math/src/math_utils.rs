pub mod constants {
    /// Bohr radius a_0 in meters (CODATA 2018)
    pub const BOHR_RADIUS_M: f64 = 5.29177210903e-11;
    /// Bohr radius a_0 in nanometers
    pub const BOHR_RADIUS_NM: f64 = 0.0529177210903;
    /// Planck constant h in J·s
    pub const PLANCK_H: f64 = 6.62607015e-34;
    /// Reduced Planck constant ħ in J·s
    pub const HBAR: f64 = 1.054571817e-34;
    /// Speed of light in vacuum c in m/s
    pub const SPEED_OF_LIGHT: f64 = 299792458.0;
    /// Elementary charge e in Coulombs
    pub const ELEMENTARY_CHARGE: f64 = 1.602176634e-19;
    /// Electron rest mass m_e in kg
    pub const ELECTRON_MASS_KG: f64 = 9.1093837015e-31;
    /// Rydberg constant R_∞ in m^-1
    pub const RYDBERG_CONST_M1: f64 = 10973731.568160;
    /// Rydberg energy R_∞ * h * c in eV
    pub const RYDBERG_ENERGY_EV: f64 = 13.605693122994;
    /// Vacuum electric permittivity ε_0 in F/m
    pub const VACUUM_PERMITTIVITY: f64 = 8.8541878128e-12;
    /// Coulomb constant 1 / (4 * π * ε_0) in N·m^2/C^2
    pub const COULOMB_CONST: f64 = 8.9875517923e9;
}

pub fn factorial(n: u32) -> Result<f64, String> {
    if n > 170 {
        return Err("Factorial overflow for n > 170".into());
    }
    Ok((1..=n).fold(1.0, |acc, x| acc * (x as f64)))
}

pub fn associated_laguerre(p: u32, q: u32, x: f64) -> f64 {
    if p == 0 {
        return 1.0;
    }

    let q_f = q as f64;
    let mut l0 = 1.0;
    let mut l1 = (q_f + 1.0) - x;

    if p == 1 {
        return l1;
    }

    let mut lp = l1;
    for k in 1..p {
        let k_f = k as f64;
        let next = ((2.0 * k_f + 1.0 + q_f - x) * l1 - (k_f + q_f) * l0) / (k_f + 1.0);
        l0 = l1;
        l1 = next;
        lp = next;
    }
    lp
}

#[allow(clippy::excessive_precision)]
pub fn gamma(z: f64) -> f64 {
    if z <= 0.0 && z.fract() == 0.0 {
        return f64::NAN;
    }
    if z < 0.5 {
        return std::f64::consts::PI / ((std::f64::consts::PI * z).sin() * gamma(1.0 - z));
    }
    let p = [
        0.99999999999980993,
        676.5203681218851,
        -1259.139216722289,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    let zm1 = z - 1.0;
    let mut x = p[0];
    for (i, &pi) in p.iter().enumerate().skip(1) {
        x += pi / (zm1 + i as f64);
    }
    let t = zm1 + (p.len() as f64) - 1.5;
    (2.0 * std::f64::consts::PI).sqrt() * t.powf(zm1 + 0.5) * (-t).exp() * x
}

pub fn associated_legendre(l: u32, m: i32, x: f64) -> Result<f64, String> {
    let m_abs = m.unsigned_abs();
    if m_abs > l {
        return Err(format!(
            "Associated legendre order m ({}) cannot exceed degree l ({})",
            m_abs, l
        ));
    }
    let x_clamped = x.clamp(-1.0, 1.0);

    let mut p_mm = 1.0;
    if m_abs > 0 {
        let somx2 = ((1.0 - x_clamped) * (1.0 + x_clamped)).max(0.0).sqrt();
        let mut fact = 1.0;
        for _ in 1..=m_abs {
            p_mm *= -fact * somx2;
            fact += 2.0;
        }
    }

    if l == m_abs {
        return Ok(p_mm);
    }

    let mut p_mmp1 = x_clamped * (2 * m_abs + 1) as f64 * p_mm;
    if l == m_abs + 1 {
        return Ok(p_mmp1);
    }

    let mut p_l = 0.0;
    for k in (m_abs + 2)..=l {
        let k_f = k as f64;
        let m_f = m_abs as f64;
        p_l = ((2.0 * k_f - 1.0) * x_clamped * p_mmp1 - (k_f + m_f - 1.0) * p_mm) / (k_f - m_f);
        p_mm = p_mmp1;
        p_mmp1 = p_l;
    }

    Ok(p_l)
}

