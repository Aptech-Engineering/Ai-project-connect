-- Move existing students from fee-derived clearance to a saved admin decision.
-- Run once after 2026_10_students.sql. Students who were cleared before this
-- change remain cleared; all other records become not cleared.
UPDATE students s
LEFT JOIN (
  SELECT student_id, SUM(amount_kobo) AS paid_kobo
  FROM student_payments
  GROUP BY student_id
) p ON p.student_id = s.id
SET s.standing = CASE
  WHEN s.standing = 'WAIVED' THEN 'WAIVED'
  WHEN s.standing = 'BLOCKED' THEN 'BLOCKED'
  WHEN s.standing = 'DISCUSSION' AND s.gate_pass = 1 THEN 'WAIVED'
  WHEN s.standing = 'AUTO' AND (
    s.fee_kobo = 0 OR COALESCE(p.paid_kobo, 0) >= s.fee_kobo
  ) THEN 'WAIVED'
  ELSE 'BLOCKED'
END,
s.gate_pass = 0;
