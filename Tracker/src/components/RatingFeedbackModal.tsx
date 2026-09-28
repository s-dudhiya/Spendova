import { useState } from "react";
import { Star } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RatingFeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  roundNumber: number;
  userName?: string;
  onSubmitted: () => void;
}

const LOW_RATING_TAGS = [
  "Buggy / Glitches",
  "Confusing Navigation",
  "Slow or Laggy",
  "Missing Features",
  "Split Calculation Issues",
  "Other",
];

const HIGH_RATING_TAGS = [
  "Clean & Modern UI",
  "Easy Friend Splits",
  "Group Expenses",
  "Fast & Simple",
  "Budget & Ledgers",
  "Good Notifications",
];

const RATING_EMOTIONS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: "Very Dissatisfied", emoji: "😞", color: "text-destructive" },
  2: { label: "Needs Improvement", emoji: "😐", color: "text-warning" },
  3: { label: "Average / Okay", emoji: "🙂", color: "text-amber-500" },
  4: { label: "Good Experience", emoji: "😊", color: "text-success" },
  5: { label: "Love Spendova!", emoji: "🌟", color: "text-primary font-bold" },
};

export const RatingFeedbackModal = ({
  open,
  onOpenChange,
  userId,
  roundNumber,
  onSubmitted,
}: RatingFeedbackModalProps) => {
  const { toast } = useToast();
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const activeRating = hoverRating || rating;
  const isHighRating = rating >= 4;
  const isLowRating = rating > 0 && rating <= 3;
  const availableTags = isHighRating ? HIGH_RATING_TAGS : LOW_RATING_TAGS;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleRatingSelect = (newRating: number) => {
    if (newRating !== rating) {
      setRating(newRating);
      setSelectedTags([]); // Reset tags if switching between low and high
    }
  };

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      const sentiment = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";

      const { error } = await supabase.rpc("submit_app_rating" as never, {
        p_rating: rating,
        p_sentiment: sentiment,
        p_selected_tags: selectedTags,
        p_comment: comment.trim() || null,
        p_round_number: roundNumber,
      } as never);

      if (error) throw error;

      toast({
        title: "Thank you!",
        description: "Your feedback helps us continuously improve Spendova.",
      });

      onSubmitted();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      toast({
        title: "Error submitting feedback",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[calc(100vw_-_1.5rem)] max-w-md overflow-hidden rounded-[1.5rem] border-border bg-card p-0 shadow-panel sm:w-full [&>button]:hidden"
      >
        <div className="relative p-5 sm:p-6">
          <div className="space-y-4">
            {/* Header */}
            <div className="text-center pt-1">
              <h3 className="text-base font-bold text-foreground tracking-tight sm:text-lg">
                How is Spendova working for you?
              </h3>
              <p className="mt-1 text-xs font-medium text-muted-foreground leading-normal">
                Your honest feedback helps us make it better for everyone.
              </p>
            </div>

              {/* Star Rating Bar */}
              <div className="flex flex-col items-center gap-1.5 py-1">
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((starValue) => {
                    const isFilled = starValue <= activeRating;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        onClick={() => handleRatingSelect(starValue)}
                        onMouseEnter={() => setHoverRating(starValue)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="group p-1 transition-transform active:scale-90 focus:outline-none"
                        aria-label={`Rate ${starValue} stars`}
                      >
                        <Star
                          className={`size-8 transition-all duration-150 ${
                            isFilled
                              ? "fill-primary text-primary scale-110 drop-shadow-sm"
                              : "text-muted-foreground/35 hover:text-primary/60 hover:scale-105"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Rating Emotion Label */}
                <div className="h-5 text-center">
                  {activeRating > 0 ? (
                    <span className={`text-xs font-semibold ${RATING_EMOTIONS[activeRating].color}`}>
                      {RATING_EMOTIONS[activeRating].emoji} {RATING_EMOTIONS[activeRating].label}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-muted-foreground/75">
                      Tap a star to rate
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic Follow-up Section */}
              {rating > 0 && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                  <p className="text-xs font-semibold text-foreground">
                    {isHighRating
                      ? "What do you love most about Spendova?"
                      : "We're sorry! What could we improve or what dissatisfied you?"}
                  </p>

                  {/* Quick Select Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-surface text-foreground border border-border/70 hover:bg-elevated"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  {/* Optional Free-text comment */}
                  <div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={
                        isHighRating
                          ? "Anything else you'd like to share or feature suggestions? (optional)"
                          : "Tell us more details about what went wrong... (optional)"
                      }
                      rows={3}
                      style={{ fontSize: "12px" }}
                      className="w-full resize-none rounded-2xl border border-input/80 bg-background/80 px-3.5 py-2.5 !text-xs font-normal text-foreground placeholder:!text-xs placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                <Button
                  type="button"
                  disabled={rating === 0 || submitting}
                  onClick={handleSubmit}
                  className="w-full h-11 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-primary-action transition-transform active:scale-[0.99]"
                >
                  {submitting ? "Submitting..." : "Submit Feedback"}
                </Button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="mt-2.5 w-full py-1 text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Remind me later
                </button>
              </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
