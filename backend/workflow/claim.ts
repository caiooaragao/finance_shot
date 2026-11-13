/** Só reivindica etapa pending e incrementa a tentativa uma vez. */
export const CLAIM_SQL = `UPDATE workflow_steps
SET status = 'running',
    attempts = attempts + 1,
    started_at = now()
WHERE plan_id = $1 AND id = $2 AND status = 'pending'
RETURNING *`;
