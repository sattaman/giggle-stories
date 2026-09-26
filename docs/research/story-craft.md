# Story craft: what makes a good children's story (for audio)

Research to guide Storytime's story writer, story-type selector and evaluator. Researched September 2026.

The labels below show how strong each claim is:
- **[Evidence]** comes from peer-reviewed research or well-replicated developmental findings.
- **[Industry]** is a consistent publishing or broadcast convention, stated by many editors, agents and producers.
- **[Rule of thumb]** is craft advice from practitioners. It is widely repeated but not tested.

---

## Recommendations for Storytime

1. **Shorten 0–4 and keep 6 pages.** A good read-aloud pace for young children is about **100–125 words per minute** [Evidence-ish, see §1]. With performed pauses and character voices, allow about 110 wpm.
   - Our current plan lands at 3–5 min (0–4), 5.5–8 min (5–8) and 8–12 min (9–12).
   - The 5–8 and 9–12 ranges are fine.
   - 0–4 is at the ceiling of a full picture book, and too long for 0–2.
   - Proposed:

   | Band | Words/page | Total words | Audio |
   |---|---|---|---|
   | 0–4 | 30–60 | 180–360 | ~2–3.5 min |
   | 5–8 | 80–130 | 480–780 | ~4.5–7 min |
   | 9–12 | 130–200 | 780–1,200 | ~7–11 min |

   Six pages still maps well onto a beginning (1), three escalating attempts (2–4), a climax/reversal (5) and a resolution with a callback (6).
2. **Build every story on one skeleton.** The hero has a clear want, and a problem appears by page 1. Then come three escalating tries, the third a twist or reversal. **The child-hero solves it**; no adult rescues. The ending calls back to an early joke or refrain.
3. **Give 0–4 and 5–8 stories a refrain.** A short, chantable line (under 8 words) that recurs 3+ times, ideally with a sound effect the child can join in on. Repetition and prediction are the core pleasures at these ages.
4. **Match the humour to the age.** 0–4: physical silliness, funny noises, wrong-name/wrong-object incongruity, with no one hurt. 5–8: slapstick, gross-out, exaggeration, riddles and simple puns. 9–12: wordplay, irony, running gags, characters being confidently wrong, gentle mockery of adults.
5. **Write for the ear.** Keep sentences short (about 10 words, one idea each). Name the speaker *before* or right at the start of a line. Use few named characters (2–3 at 0–4). Pause before reveals. End pages 1–5 on a question or a small cliffhanger.
6. **Offer these story types:** Silly (default), Adventure, Mystery, Find-out-about (learning), Spooky (5+ only, or a very mild "not-scary monster" variant at 0–4) and Bedtime (calm; humour turned down). Each has hard constraints in §3.
7. **Score generated stories against the rubric in §5.** It has 9 criteria on a 1–5 scale. Use an LLM judge with band- and genre-specific anchors.

---

## 1. Length and shape

### Print conventions [Industry]
| Format | Age | Words | Pages |
|---|---|---|---|
| Board book / toddler picture book | 0–3 | ~0–300 (often under 100) | 12–24 |
| Picture book (fiction) | 3–7 | 300–600 (current sweet spot 400–500; editors wary near 1,000) | 32 (≈14 spreads) |
| Early reader | 5–8 | 1,000–2,500 | 32–64 |
| Chapter book | 6–9 / 7–10 | 4,000–15,000, short chapters | 48–100 |
| Middle grade | 8–12 | 20,000–50,000 | – |

That works out to roughly **20–40 words per spread** in a picture book, and often a single line in toddler books. Picture books have shrunk over the decades: the old norm was 1,000+ words, and 400–500 is now preferred. Nonfiction picture books run longer (800–1,200).

### Audio time
- Adult audiobook narration runs about 150–160 wpm. Typical adult reading aloud is faster still (English is about 228 ± 30 wpm in cross-language studies).
- For reading *to young children*, the recommended rate is **100–125 wpm**. Comprehension drops above 125; going slower costs less than going faster. This comes from patent and literacy-tool literature citing comprehension studies, so treat it as a strong rule of thumb, not settled science.
- The Gemini TTS narrator should be steered to an unhurried pace for 0–4 and 5–8.

**Comparators:**
- A 500-word picture book takes about 4–5 minutes to read aloud.
- Calm bedtime stories are typically 2–7 minutes.
- WBUR's *Circle Round* (ages 3+, full radio plays) runs 15–25 minutes, but that is a produced show, not a nightly generated story.

**Implication:** a 0–4 story shouldn't run longer than a short picture book (about 3 minutes). For 5–8, 5–7 minutes suits one sitting. For 9–12, 8–11 minutes is fine: they listen to far longer audio, but our cost is TTS requests, and a shorter story means "another one!" comes sooner. Keep 6 pages at all bands; changing length per page is enough. Page count mainly sets the number of beats, and 6 beats fits the three-tries structure.

---

## 2. What makes it good

### Structure
- **Problem on page 1** [Industry]. Picture books have no room for a slow start. The same goes for radio drama: "don't take too long to get started into the main action" (British Council radio drama tips).
- **Rule of three** [Rule of thumb, near-universal]. Three attempts, three characters or three objects (*Three Little Pigs*, *Goldilocks*, *Billy Goats Gruff*). Attempts 1–2 set up a pattern; attempt 3 breaks it (reversal or twist) or succeeds in an unexpected way. This drives page turns and prediction.
- **Escalation.** Each attempt is bigger, sillier or riskier than the last.
- **Satisfying ending with a callback.** The last page echoes the refrain, the opening line or an early joke, and the hero's want is resolved, often in a surprising way. For young children, a return home or to safety is expected (the "home–away–home" pattern) [Industry].
- **Keep it simple.** One plot line, few characters. "Too many themes, characters and plotlines" confuse listeners (British Council radio tips) [Industry].

### Character
- **A clear want**, stated early, in terms a child understands (wants the biggest cake, wants to find the lost sock).
- **A flaw or quirk** that causes trouble and is funny: over-confidence, a terrible sense of direction, can't stop sneezing. At 9–12 the flaw can also drive a small change in the character.
- **Agency: the child-hero solves it** [Industry, emphatic]. Editors cite "the adult solves the problem" as a leading reason picture books fail. Adults and helpers can encourage, but the hero must try, fail and solve it. It matters here in particular: the child named the idea and is often the hero.

### Humour by age
Research lists what children find funny: exaggeration, predicaments, surprise, slapstick, defiance, the absurd, verbal humour and incongruity (humour-in-picture-books research, UNC).

| Band | What works | Evidence |
|---|---|---|
| 0–4 | Incongruity with familiar things: wrong names, wrong uses (a hat on a fish), funny noises and words, peekaboo-style surprise, mild naughtiness. | [Evidence] McGhee's stages: incongruous actions on objects, then incongruous labelling (about age 2–3), then conceptual incongruity (3–7). |
| 4–8 | **Slapstick where the victim looks bewildered, not hurt or angry.** 4–5-year-olds found misfortune funny only with a bewildered face; recognition tracked theory-of-mind skill. Also toilet humour, exaggeration, clowning. Riddles start to land around ages 6–8 and peak in grades 1–2. | [Evidence] Frontiers in Cognition 2024 slapstick study; riddle-comprehension studies. |
| 9–12 | More verbal and cognitive humour: puns with double meanings, irony, a character confidently wrong, running gags, mild taboo, adults made to look silly. | [Evidence] Humour gets more verbal and cognitive by about age 9. |

Guardrail at all bands: characters don't get hurt, and humour never punches down at the child.

### Repetition, refrains, interactivity
- **[Evidence]** Rhythm, rhyme, repetition and prediction are central to early literacy and enjoyment (Mem Fox, *Reading Magic*). Repeated and interactive read-alouds improve vocabulary and comprehension more than plain reading. In dialogic reading, the adult asks open questions and expands on the child's answers.
- **[Rule of thumb]** A refrain used about three times works well (beginning, middle, end) and should move the story forward, not just decorate it (Kirkfield, Writer's Digest).
- For audio, build in **join-in moments**: a repeated sound effect, a countdown, or "and what do you think he said?" followed by a pause. Our app can't respond to what the child says mid-story, so keep these as rhetorical prompts with a short pause, not real questions.

### Pacing and page turns
- **[Industry]** Every page turn should create suspense, surprise or momentum. Editors check each spread for this.
- In audio the "page turn" is the gap between pages. End pages on an unanswered question ("And then the door creaked open…"), and resolve it in the first line of the next page.

---

## 3. Story types (for the selector)

| Type | Structural signature | Bands | Must-haves / avoid |
|---|---|---|---|
| **Silly** (default) | Absurd premise taken seriously; escalating ridiculousness; three tries; callback ending. | All | Highest joke density. Absurdity must follow its own internal rules. |
| **Adventure** | A journey or quest: leave home, three obstacles of rising difficulty, a clever solution, return. | All (short quest at 0–4) | Peril stays low at 0–4. The hero wins by cleverness or kindness, not violence. |
| **Mystery** | The puzzle is set on page 1, **clues planted fairly** through the middle, and a reveal the listener *could* have worked out. Plan it from the reveal backwards. The hero earns the clues rather than being handed them. No villain monologue explaining everything (Fleur Bradley, SCBWI). | 5–8, 9–12. At 0–4 only a "where is it / who is it?" guessing game. | For young children "mysteries don't require crimes": a missing tooth, a strange noise. The hero's actions must cause the solution (Institute for Children's Literature). At 5–8, 2–3 clues and at most one red herring. At 9–12, 3–4 clues, 1–2 red herrings, and a fair twist. |
| **Find out about** (learning) | Narrative nonfiction style: facts carried **inside scenes and the plot**, with a real narrative arc (Melissa Stewart). The fact is the key to solving the problem (a gecko's sticky feet let the hero climb out). | 5–8, 9–12. 0–4: one simple fact (animal sounds, colours). | No lecturing narrator, and no fact lists. Show facts through what characters do and see. At most 2–3 true facts, all accurate. Tag the facts in the outline so they can be checked. |
| **Spooky** | Build-up of suspense (noises, shadows, the rule of three), then a reveal that turns fear into laughter or friendship. The "monster" is harmless, scared itself, or silly. | 5–8 (fun-scary), 9–12 (properly shivery). 0–4: "not-scary monster" only. | See below. |
| **Bedtime** (calm) | Slow pace, a small gentle quest, repetitive soothing refrain, a winding-down ending: the character gets cosy and sleeps. Energy should *fall* across pages. | All, especially 0–4 | Humour gentle, not hyper. No cliffhangers. Last page quiet. Sources note that funny or adventure stories can wind children up at bedtime. |

### Keeping spooky fun-scary [Evidence: Cantor's fright-response research]
Fear changes with cognitive stage:
- **Preoperational children (about 3–7)** are frightened by *how things look*: grotesque appearance, fantasy monsters, **transformations** (a character turning into a monster) and interpersonal violence. Telling them "it's not real" doesn't help; comfort and closeness do.
- **Children of about 7/8–11** understand that appearance can deceive. They fear realistic dangers that could happen to them: injury, fire, burglars, losing parents. Reasoning and explanation help.

**0–4: avoid**
- transformations (a friend or parent becoming scary)
- grotesque or detailed monster descriptions
- separation from carers or being lost alone
- darkness as a real threat
- any violence
- unresolved endings

Allowed: a monster who turns out to be friendly or silly, revealed quickly (*The Monster at the End of This Book* model). The audio should be soft, with no sudden loud stings.

**5–8: avoid**
- gore
- realistic dangers (house fire, intruders, kidnapping, death of a parent or pet)
- threats aimed at the child personally
- transformations of trusted characters
- endings where the threat is still out there

Allowed: creepy noises, shadows, dares and "haunted" places, with a funny or cosy reveal. The hero is brave and in control, a friend is present, and the danger is fully resolved.

**9–12:** real suspense, mild peril and a genuine chill at the twist are fine. Still avoid gore, realistic trauma and a hopeless ending. A final comic sting ("…then the toaster winked") works well.

In every band, the child-hero is the one who faces the scare. That turns it into mastery, which is the developmental benefit of scary stories [Evidence-ish].

---

## 4. Audio-specific craft [Industry: radio/podcast writing guidance]

- **Listeners can't reread.** One idea per sentence, about 10 words or fewer on average, familiar words (plus one or two deliciously new ones, repeated so they stick).
- **Attribution first.** Put the speaker before the line or right at its start: "Grandpa Bear boomed, 'Who's been eating my porridge?'" Distinct character voices help, but we still need the name at first appearance and when the speaker changes after narration. Avoid long runs of unattributed back-and-forth.
- **Few, distinct characters.** 2–3 speaking parts at 0–4, up to 4–5 at 9–12. Give them sound-distinct names (not Tim and Tom) and one verbal tic each (catchphrase, stutter-laugh, rhyming habit). A tic helps the listener track who is speaking and gives the voice actor something to play.
- **Sound and vocal play.** Onomatopoeia (SPLAT, bloop), animal noises and silly made-up words are funny to hear and easy to perform. Radio drama uses "a variety of backgrounds, scene lengths and sound effects" to keep listeners oriented. Ties into `docs/research/sound-effects.md`.
- **Signpost scenes.** Say where we are when the scene changes ("Back at the castle…"). Audio has no pictures to do it.
- **Repetition is a feature.** It stands in for the illustrations young children would reread.
- **Pause before reveals.** Put a beat (an ellipsis or a stage direction for TTS) before the punchline, the monster's reveal and the answer to the mystery.
- **Page endings.** Pages 1–5 end with a hook: a question, a door opening, or a "but then…". Page 6 closes everything (and at bedtime, quietly).

---

## 5. Evaluation rubric

Score 1–5 on each criterion. An LLM judge gets the age band, genre and the child's original idea.

| # | Criterion | Definition | 1 | 3 | 5 | Varies by |
|---|---|---|---|---|---|---|
| 1 | **Fidelity to the child's idea** | The story is recognisably about what the child asked for, including their answers to the questions. | Ignores or swaps the idea. | Idea present but generic. | Idea is central and its specific details pay off. | – |
| 2 | **Clear want and problem** | The hero wants something concrete, and the problem is clear by the end of page 1. | No clear goal, or it arrives late. | Goal present but vague or late. | Crisp want and obstacle in the first lines. | – |
| 3 | **Structure and escalation** | Beginning, escalating attempts (rule of three), climax or reversal, resolution. | Episodic or flat; stops rather than ends. | Arc present but attempts don't build. | Three attempts escalate; the third twists; the ending resolves the want. | Bedtime: energy falls, not rises. |
| 4 | **Hero agency** | The child-hero's choices and actions solve the problem. | Rescued by an adult or luck. | Hero helps but someone else is decisive. | Hero's own cleverness or kindness wins. | – |
| 5 | **Humour fit** | Jokes are frequent, land, and match the band's humour level. | No humour, or jokes above or below the age, or mean. | Some mild fun. | Several genuine laugh moments of the right kind (see §2); no one hurt. | Band; Bedtime (gentle). |
| 6 | **Repetition and callback** | A refrain or pattern recurs, and the ending calls back to the beginning. | None. | Repetition present but decorative. | Refrain used about 3 times, moves the plot, invites joining in; ending echoes opening. | Stronger weight at 0–4 and 5–8; optional at 9–12. |
| 7 | **Ear-friendliness** | Short sentences, clear attribution, few distinct characters, scene signposts, performable sounds. | Long sentences; you can't tell who's talking. | Mostly clear, some tangles. | Every line is easy to follow aloud; sound words and vocal moments give the performers something to play. | Sentence length and cast size by band. |
| 8 | **Age-appropriate length and language** | Word count within the band's target; vocabulary suits the band. | More than 30% off target, or the vocabulary misses the age. | Within 30%, a few misses. | On target; one or two rich new words, repeated in context. | Band word targets (§ Recommendations). |
| 9 | **Genre delivery and safety** | Delivers the genre's promise within its limits. | Genre missing or violated (unfair mystery, lecture, too scary). | Genre recognisable but weak. | Mystery: fair clues plus reveal. Learning: 2–3 accurate facts drive the plot. Spooky: shivers then relief, nothing on the avoid list. Adventure: journey plus obstacles. Bedtime: calming close. | Genre, and band for spooky. |

Page hooks (pages 1–5 end on a question or cliffhanger) can go under #3 or become a tenth criterion. Hard fails should override the score: frightening content from the avoid list, factual errors in a learning story, and non-first-name personal data.

---

## Sources

**Length and format**
- Good Story Company, *Picture Book Word Count*: https://www.goodstorycompany.com/blog/picture-book-word-count
- Writers in the Storm, *Picture Book Word Counts: Minimalism to Modern Stories* (2025): https://writersinthestormblog.com/2025/02/picture-book-word-counts-minimalism-to-modern-stories/
- Bookfox, *Perfect length for a children's picture book*: https://thejohnfox.com/2023/08/whats-the-perfect-length-for-a-childrens-picture-book/
- Emma Walton Hamilton, *How long should children's books be?*: https://emmawaltonhamilton.com/blog/how-many-pages-are-in-a-childrens-book/
- Mary Kole Editorial, *Chapter book age range*: https://www.marykole.com/chapter-book-age-range
- Penguin UK, *How to write a children's middle grade book*: https://www.penguin.co.uk/about/company-articles/how-to-write-a-children-s-middle-grade-book

**Speaking rate and audio**
- Speaking rate: Wikipedia, *Words per minute* (cross-language read-aloud rates): https://en.wikipedia.org/wiki/Words_per_minute
- USPTO patent 11386918, *Assessing reading quality* (100–125 wpm for reading to children): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11386918
- WBUR, *About Circle Round*: https://www.wbur.org/podcasts/circleround/about
- British Council, *Tips: Writing plays for radio*: https://www.britishcouncil.org.ua/en/programmes/arts/literature/radiodrama/tips
- NPR Training, *From print to radio storytelling* (2025): https://www.npr.org/sections/npr-training/2025/05/30/g-s1-65814/the-journey-from-print-to-radio-storytelling-a-guide-for-navigating-a-new-landscape
- AAJA, *Writing for the ear*: https://aaja-asia.org/writing-for-the-ear-and-other-lessons-in-radio-journalism/

**Read-aloud and repetition**
- Mem Fox, *Reading Magic*: https://en.wikipedia.org/wiki/Reading_Magic
- NAEYC interview with Mem Fox: https://www.naeyc.org/our-work/families/bond-through-reading
- Pillinger & Vardy (2022), *The story so far: systematic review of dialogic reading*: https://reachoutandread.org/wp-content/uploads/2023/06/Pillinger_2022_A-story-so-far-A-systematic-review-of-the-dialogic-reading-literature.pdf
- McGee & Schickedanz (2007), *Repeated interactive read-alouds*, The Reading Teacher: https://ila.onlinelibrary.wiley.com/doi/abs/10.1598/RT.60.8.4
- Emma Walton Hamilton, *The Rule of 3 in picture books*: https://emmawaltonhamilton.com/blog/the-rule-of-3-in-picture-books-when-why-how-to-use-it/
- Writer's Digest, *5 ways to add a refrain to your picture books*: https://www.writersdigest.com/write-better-fiction/5-ways-to-add-a-refrain-to-your-picture-books-and-why-you-should
- Words & Pictures (SCBWI BI), *Wonderfully useful refrains*: https://www.wordsandpics.org/2017/07/picture-book-knowhow-wonderfully-useful.html

**Character and agency**
- KidLit Craft, *Making a child the agent of their own change*: https://www.kidlitcraft.com/craft-articles/picture-book-heroes-making-a-child-the-agent-of-the-own-change
- Nathan Bransford, *How picture books work*: https://nathanbransford.com/blog/2018/03/picture-books-work-brief-primer

**Humour**
- Frontiers in Cognition (2024), *Children's recognition of slapstick humor is linked to their Theory of Mind*: https://www.frontiersin.org/journals/cognition/articles/10.3389/fcogn.2024.1369638/full
- McGhee, *Understanding and promoting the development of children's humor*: https://www.laughterremedy.com/books-by-dr-mcghee/understanding-and-promoting-the-development-of-childrens-humor/
- *Humor development in preschool and primary* (ERIC): https://files.eric.ed.gov/fulltext/EJ1382690.pdf
- *Humor in children's picture books* (UNC): https://cdr.lib.unc.edu/downloads/rv042z17b?locale=en

**Genres**
- Fleur Bradley, *3 tips for writing mystery for kids* (SCBWI blog, 2024): http://scbwi.blogspot.com/2024/05/3-tips-for-writing-mystery-for-kids.html
- Institute for Children's Literature, *Mystery for young children*: https://www.instituteforwriters.com/mystery-for-young-children/
- Melissa Stewart, *Narrative vs expository nonfiction*: https://melissa-stewart.com/educators/nonfiction_reading_resources/narrative_nf_vs_expository_nf/
- Miriam Laundry, *How to write bedtime stories*: https://miriamlaundry.com/how-to-write-a-bedtime-story-for-kids/
- The Kids Tales, *Bedtime stories that calm kids*: https://www.thekidstales.com/blog/10-best-bedtime-stories-for-kids-that-actually-help-them-sleep

**Fear and scariness**
- Education Week, *What scares children?* (on Cantor's research, 1996): https://www.edweek.org/education/what-scares-children/1996/04
- Cantor, *Fright responses to media* (Wiley reference): https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118783764.wbieme0165
- University of Michigan, *Children and monstrosity* (summarises Cantor's developmental findings): https://websites.umich.edu/~umfandsf/symbolismproject/symbolism.html/Monstrosity/childad/child.htm
- AAP, *Kids and horror content*: https://www.aap.org/en/patient-care/media-and-children/center-of-excellence-on-social-media-and-youth-mental-health/qa-portal/qa-portal-library/qa-portal-library-questions/kids-and-horror-content/
