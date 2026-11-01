use crate::math_utils::constants::RYDBERG_ENERGY_EV;
use crate::spherical_harmonics::{real_orbital_angular, real_orbital_polar};
use crate::wavefunctions::r_nl;
use crate::{real_orbital_kind_from_lm, QuantumNumbers, RealOrbitalKind, LCAO_STATE_LEN};

const N_ETA: usize = 48;
const N_XI: usize = 80;
const GL2_HALF_INV_SQRT3: f64 = 0.288_675_134_594_812_87;

#[derive(Clone, Copy, Debug)]
pub struct AtomicBasis {
    pub n: u32,
    pub l: u32,
    pub m: i32,
    pub z_eff: f64,
    pub kind: RealOrbitalKind,
}

impl AtomicBasis {
    pub fn new(n: u32, l: u32, m: i32, z_eff: f64) -> Result<Self, String> {
        QuantumNumbers::new(n, l, m)?;
        let kind = real_orbital_kind_from_lm(l, m).ok_or_else(|| {
            format!(
                "No real orbital representation available for l={}, m={}",
                l, m
            )
        })?;
        if !z_eff.is_finite() || z_eff <= 0.0 {
            return Err(format!(
                "Effective nuclear charge Z_eff ({}) must be positive",
                z_eff
            ));
        }
        Ok(Self {
            n,
            l,
            m,
            z_eff,
            kind,
        })
    }
}

#[derive(Clone, Copy, Debug)]
pub struct SecularSolution {
    pub eps_a_ev: f64,
    pub eps_b_ev: f64,
    pub mo_eps_bond_ev: f64,
    pub mo_eps_anti_ev: f64,
    pub c_a_bond: f64,
    pub c_b_bond: f64,
    pub c_a_anti: f64,
    pub c_b_anti: f64,
    pub share_a_bond: f64,
    pub share_b_bond: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct PotentialCurveParams {
    pub r_eq_bohr: f64,
    pub d_e_ev: f64,
    pub morse_a: f64,
    pub gamma_anti: f64,
}

fn validate_distance(r_bohr: f64) -> Result<(), String> {
    if !r_bohr.is_finite() || r_bohr < 0.2 {
        return Err(format!(
            "Internuclear distance R ({}) must be >= 0.2 Bohr",
            r_bohr
        ));
    }
    Ok(())
}

fn eta_quadrature_nodes() -> [f64; N_ETA] {
    let panels = N_ETA / 2;
    let h = 2.0 / (panels as f64);
    let offset = GL2_HALF_INV_SQRT3 * h;
    let mut nodes = [0.0; N_ETA];
    for p in 0..panels {
        let center = -1.0 + (p as f64 + 0.5) * h;
        nodes[2 * p] = center - offset;
        nodes[2 * p + 1] = center + offset;
    }
    nodes
}

fn xi_quadrature_nodes(xi_span: f64) -> [(f64, f64); N_XI] {
    let panels = N_XI / 2;
    let h = 1.0 / (panels as f64);
    let offset = GL2_HALF_INV_SQRT3 * h;
    let d_u = 1.0 / (N_XI as f64);
    let mut nodes = [(0.0, 0.0); N_XI];
    for p in 0..panels {
        let center = (p as f64 + 0.5) * h;
        let u0 = center - offset;
        let u1 = center + offset;
        nodes[2 * p] = (1.0 + xi_span * u0 * u0, 2.0 * xi_span * u0 * d_u);
        nodes[2 * p + 1] = (1.0 + xi_span * u1 * u1, 2.0 * xi_span * u1 * d_u);
    }
    nodes
}

fn two_center_overlap_unchecked(
    a: &AtomicBasis,
    b: &AtomicBasis,
    r_bohr: f64,
) -> Result<f64, String> {
    if a.m != b.m {
        return Ok(0.0);
    }

    let phi_factor = if a.m == 0 {
        2.0 * std::f64::consts::PI
    } else {
        std::f64::consts::PI
    };
    let alpha_min = (a.z_eff / a.n as f64).min(b.z_eff / b.n as f64);
    let xi_span = (28.0 / (alpha_min * r_bohr)).max(4.0);

    let eta_nodes = eta_quadrature_nodes();
    let xi_nodes = xi_quadrature_nodes(xi_span);
    let d_eta = 2.0 / (N_ETA as f64);
    let half_r = 0.5 * r_bohr;

    let mut sum = 0.0;
    for &(xi, d_xi) in &xi_nodes {
        for &eta in &eta_nodes {
            let r_a = half_r * (xi + eta);
            let r_b = half_r * (xi - eta);
            let theta_a = ((1.0 + xi * eta) / (xi + eta)).clamp(-1.0, 1.0).acos();
            let theta_b = ((1.0 - xi * eta) / (xi - eta)).clamp(-1.0, 1.0).acos();

            let psi_a = r_nl(a.n, a.l, a.z_eff, r_a)? * real_orbital_polar(&a.kind, theta_a);
            let psi_b = r_nl(b.n, b.l, b.z_eff, r_b)? * real_orbital_polar(&b.kind, theta_b);
            sum += psi_a * psi_b * (xi * xi - eta * eta) * d_xi * d_eta;
        }
    }

    let s = sum * half_r.powi(3) * phi_factor;
    Ok(s.clamp(-0.999_999, 0.999_999))
}

/// Two-center overlap integral `S = <φ_A | φ_B>` in prolate spheroidal coordinates.
/// Atom A sits at `(0, 0, -R/2)` and Atom B at `(0, 0, +R/2)` with reflected local `z_B -> -z_B`.
pub fn two_center_overlap(a: &AtomicBasis, b: &AtomicBasis, r_bohr: f64) -> Result<f64, String> {
    validate_distance(r_bohr)?;
    two_center_overlap_unchecked(a, b, r_bohr)
}

pub fn solve_secular_2x2(a: &AtomicBasis, b: &AtomicBasis, s: f64) -> SecularSolution {
    let n_a = a.n as f64;
    let n_b = b.n as f64;
    let eps_a_ev = -RYDBERG_ENERGY_EV * a.z_eff * a.z_eff / (n_a * n_a);
    let eps_b_ev = -RYDBERG_ENERGY_EV * b.z_eff * b.z_eff / (n_b * n_b);

    let eps_avg = 0.5 * (eps_a_ev + eps_b_ev);
    let s_pos = s.max(0.0);
    let h_gg = eps_avg - 0.75 * eps_avg.abs() * (s_pos / (1.0 + s_pos));
    let h_uu = eps_avg + 0.75 * eps_avg.abs() * (s_pos / (1.0 - s_pos.min(0.95)));
    let h_gu = (eps_a_ev - eps_b_ev) / (2.0 * (1.0 - s_pos * s_pos).max(0.05).sqrt());

    let diff = h_uu - h_gg;
    let rad = (0.25 * diff * diff + h_gu * h_gu).sqrt();
    let mid = 0.5 * (h_gg + h_uu);
    let mo_eps_bond_ev = mid - rad;
    let mo_eps_anti_ev = mid + rad;

    let gamma = 0.5 * (-2.0 * h_gu).atan2(diff);
    let (sin_g, cos_g) = gamma.sin_cos();
    let inv_g = 1.0 / (2.0 * (1.0 + s)).sqrt();
    let inv_u = 1.0 / (2.0 * (1.0 - s)).sqrt();

    let c_a_bond = cos_g * inv_g + sin_g * inv_u;
    let c_b_bond = cos_g * inv_g - sin_g * inv_u;
    let c_a_anti = -sin_g * inv_g + cos_g * inv_u;
    let c_b_anti = -sin_g * inv_g - cos_g * inv_u;

    let share_a_bond = (c_a_bond * c_a_bond + c_a_bond * c_b_bond * s).clamp(0.0, 1.0);
    let share_b_bond = 1.0 - share_a_bond;

    SecularSolution {
        eps_a_ev,
        eps_b_ev,
        mo_eps_bond_ev,
        mo_eps_anti_ev,
        c_a_bond,
        c_b_bond,
        c_a_anti,
        c_b_anti,
        share_a_bond,
        share_b_bond,
    }
}

pub fn orbital_bond_scale(n: u32, l: u32, m: i32) -> f64 {
    match (n, l, m) {
        (1, 0, 0) => 0.7005,
        (2, 1, 0) => 3.48,
        (2, 1, _) => 2.76,
        _ => {
            let n_f = n as f64;
            0.70 * n_f * n_f
        }
    }
}

pub fn compute_potential_params(
    a: &AtomicBasis,
    b: &AtomicBasis,
) -> Result<PotentialCurveParams, String> {
    let n_a = a.n as f64;
    let n_b = b.n as f64;
    let eps_a = -RYDBERG_ENERGY_EV * a.z_eff * a.z_eff / (n_a * n_a);
    let eps_b = -RYDBERG_ENERGY_EV * b.z_eff * b.z_eff / (n_b * n_b);

    let r_eq_bohr =
        orbital_bond_scale(a.n, a.l, a.m) / a.z_eff + orbital_bond_scale(b.n, b.l, b.m) / b.z_eff;
    let s_eq = two_center_overlap_unchecked(a, b, r_eq_bohr.max(1e-4))?
        .abs()
        .clamp(0.05, 0.92);

    let k_bond = if a.l == 0 && b.l == 0 {
        0.464
    } else if a.m == 0 {
        0.55
    } else {
        0.52
    };
    let polarity = (eps_a - eps_b).powi(2) / (eps_a.powi(2) + eps_b.powi(2)).max(1e-9);
    let d_e_ev = k_bond * (eps_a.abs() * eps_b.abs()).sqrt() * s_eq * (1.0 + 0.15 * polarity);
    let morse_a = 1.44 / r_eq_bohr;
    let gamma_anti = ((1.0 + s_eq) / (1.0 - s_eq)).clamp(1.25, 2.40);

    Ok(PotentialCurveParams {
        r_eq_bohr,
        d_e_ev,
        morse_a,
        gamma_anti,
    })
}

pub fn evaluate_potential_at(params: &PotentialCurveParams, r_bohr: f64) -> (f64, f64) {
    let x = (-params.morse_a * (r_bohr - params.r_eq_bohr))
        .clamp(-20.0, 6.0)
        .exp();
    let e_pot_bond_ev = params.d_e_ev * (x * x - 2.0 * x);
    let e_pot_anti_ev = 0.5 * params.d_e_ev * params.gamma_anti * (x * x + 2.0 * x);
    (e_pot_bond_ev, e_pot_anti_ev)
}

fn basis_at_local(basis: &AtomicBasis, x: f64, y: f64, z_local: f64) -> Result<f64, String> {
    let r = (x * x + y * y + z_local * z_local).sqrt();
    let theta = if r > 1e-12 {
        (z_local / r).clamp(-1.0, 1.0).acos()
    } else {
        0.0
    };
    let phi = y.atan2(x);
    Ok(r_nl(basis.n, basis.l, basis.z_eff, r)? * real_orbital_angular(&basis.kind, theta, phi))
}

fn mo_pair_at(
    a: &AtomicBasis,
    b: &AtomicBasis,
    sec: &SecularSolution,
    r_bohr: f64,
    point: [f64; 3],
) -> Result<(f64, f64), String> {
    let half_r = 0.5 * r_bohr;
    let phi_a = basis_at_local(a, point[0], point[1], point[2] + half_r)?;
    let phi_b = basis_at_local(b, point[0], point[1], half_r - point[2])?;
    let psi_bond = sec.c_a_bond * phi_a + sec.c_b_bond * phi_b;
    let psi_anti = sec.c_a_anti * phi_a + sec.c_b_anti * phi_b;
    Ok((psi_bond, psi_anti))
}

fn update_peak(
    peak: &mut f64,
    a: &AtomicBasis,
    b: &AtomicBasis,
    sec: &SecularSolution,
    r_bohr: f64,
    point: [f64; 3],
) -> Result<(), String> {
    let (psi_bond, psi_anti) = mo_pair_at(a, b, sec, r_bohr, point)?;
    *peak = peak.max(psi_bond * psi_bond).max(psi_anti * psi_anti);
    Ok(())
}

fn compute_peak_ref_density(
    a: &AtomicBasis,
    b: &AtomicBasis,
    sec: &SecularSolution,
    r_bohr: f64,
) -> Result<f64, String> {
    let half_r = 0.5 * r_bohr;
    let scale_a = (a.n as f64) / a.z_eff;
    let scale_b = (b.n as f64) / b.z_eff;
    let extent = half_r + 2.5 * scale_a.max(scale_b);
    let mut peak = 1e-4_f64;

    update_peak(&mut peak, a, b, sec, r_bohr, [0.0, 0.0, -half_r])?;
    update_peak(&mut peak, a, b, sec, r_bohr, [0.0, 0.0, 0.0])?;
    update_peak(&mut peak, a, b, sec, r_bohr, [0.0, 0.0, half_r])?;

    for i in 0..=24 {
        let z = -extent + (i as f64 / 24.0) * (2.0 * extent);
        update_peak(&mut peak, a, b, sec, r_bohr, [0.0, 0.0, z])?;
    }

    let rhos = [0.6 * scale_a, scale_a, 0.6 * scale_b, scale_b];
    let zs = [-half_r, -0.5 * half_r, 0.0, 0.5 * half_r, half_r];
    for rho in rhos {
        let diag = std::f64::consts::FRAC_1_SQRT_2 * rho;
        for z in zs {
            update_peak(&mut peak, a, b, sec, r_bohr, [rho, 0.0, z])?;
            update_peak(&mut peak, a, b, sec, r_bohr, [0.0, rho, z])?;
            update_peak(&mut peak, a, b, sec, r_bohr, [diag, diag, z])?;
        }
    }

    Ok(peak)
}

fn bisect_anti_node(
    a: &AtomicBasis,
    b: &AtomicBasis,
    sec: &SecularSolution,
    r_bohr: f64,
    probe_xy: (f64, f64),
    mut lo: f64,
    mut hi: f64,
) -> Result<f64, String> {
    let f_lo = mo_pair_at(a, b, sec, r_bohr, [probe_xy.0, probe_xy.1, lo])?.1;
    for _ in 0..16 {
        let mid = 0.5 * (lo + hi);
        let f_mid = mo_pair_at(a, b, sec, r_bohr, [probe_xy.0, probe_xy.1, mid])?.1;
        if f_lo * f_mid <= 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    Ok(0.5 * (lo + hi))
}

fn compute_nodal_z_anti(
    a: &AtomicBasis,
    b: &AtomicBasis,
    sec: &SecularSolution,
    r_bohr: f64,
) -> Result<f64, String> {
    let is_homonuclear = a.n == b.n && a.l == b.l && a.m == b.m && (a.z_eff - b.z_eff).abs() < 1e-9;
    if is_homonuclear {
        return Ok(0.0);
    }

    let probe_xy = if a.m == 0 {
        (0.0, 0.0)
    } else if a.m > 0 {
        (0.4, 0.0)
    } else {
        (0.0, 0.4)
    };

    let z_min = -0.46 * r_bohr;
    let z_max = 0.46 * r_bohr;
    let step = (z_max - z_min) / 31.0;

    let mut prev_z = z_min;
    let mut prev_val = mo_pair_at(a, b, sec, r_bohr, [probe_xy.0, probe_xy.1, prev_z])?.1;

    for i in 1..32 {
        let z = z_min + (i as f64) * step;
        let val = mo_pair_at(a, b, sec, r_bohr, [probe_xy.0, probe_xy.1, z])?.1;
        if prev_val == 0.0 {
            return Ok(prev_z);
        }
        if prev_val * val <= 0.0 {
            return bisect_anti_node(a, b, sec, r_bohr, probe_xy, prev_z, z);
        }
        prev_z = z;
        prev_val = val;
    }

    Ok(f64::NAN)
}

pub fn evaluate_lcao_state_internal(
    a: &AtomicBasis,
    b: &AtomicBasis,
    r_bohr: f64,
) -> Result<[f64; LCAO_STATE_LEN], String> {
    let overlap_s = two_center_overlap(a, b, r_bohr)?;
    let sec = solve_secular_2x2(a, b, overlap_s);
    let pot = compute_potential_params(a, b)?;
    let (e_pot_bond_ev, e_pot_anti_ev) = evaluate_potential_at(&pot, r_bohr);
    let peak_ref_density = compute_peak_ref_density(a, b, &sec, r_bohr)?;
    let nodal_z_anti = compute_nodal_z_anti(a, b, &sec, r_bohr)?;

    Ok([
        overlap_s,
        sec.c_a_bond,
        sec.c_b_bond,
        sec.c_a_anti,
        sec.c_b_anti,
        sec.share_a_bond,
        sec.share_b_bond,
        sec.eps_a_ev,
        sec.eps_b_ev,
        sec.mo_eps_bond_ev,
        sec.mo_eps_anti_ev,
        e_pot_bond_ev,
        e_pot_anti_ev,
        pot.r_eq_bohr,
        pot.d_e_ev,
        peak_ref_density,
        nodal_z_anti,
    ])
}

pub fn evaluate_lcao_curve_internal(
    a: &AtomicBasis,
    b: &AtomicBasis,
    r_min: f64,
    r_max: f64,
    steps: usize,
) -> Result<Vec<f32>, String> {
    validate_distance(r_min)?;
    if !r_max.is_finite() || r_max <= r_min {
        return Err(format!(
            "r_max ({}) must be finite and greater than r_min ({})",
            r_max, r_min
        ));
    }
    if steps == 0 {
        return Err("steps must be greater than 0".into());
    }

    let pot = compute_potential_params(a, b)?;
    let mut curve = Vec::with_capacity((steps + 1) * 3);
    let span = r_max - r_min;
    let inv_steps = 1.0 / (steps as f64);

    for i in 0..=steps {
        let r = r_min + (i as f64) * inv_steps * span;
        let (e_bond, e_anti) = evaluate_potential_at(&pot, r);
        curve.push(r as f32);
        curve.push(e_bond as f32);
        curve.push(e_anti as f32);
    }

    Ok(curve)
}
