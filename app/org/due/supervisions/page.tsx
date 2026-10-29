import { ReviewDuePage } from "../review-due";

/** Who is due a supervision, across the organisation (ROADMAP §3). */
export default function SupervisionsDuePage() {
  return <ReviewDuePage kind="supervision" />;
}
