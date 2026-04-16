#!/usr/bin/env python3
"""
Generate self-contained demo PDFs for the Search Arena PDF search demo.
All content is original -- no third-party copyright involved.

Run at Docker build time:
    python3 generate_demo_pdfs.py /demo-pdfs
"""

import sys
from pathlib import Path
from fpdf import FPDF

OUTPUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/demo-pdfs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MARGIN = 22
LINE_H = 6.5


def make_pdf(filename: str, title: str, sections: list[tuple[str, str]]) -> None:
    pdf = FPDF()
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.set_auto_page_break(auto=True, margin=MARGIN)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 17)
    pdf.multi_cell(0, 10, title, align="C")
    pdf.ln(10)

    for heading, body in sections:
        pdf.set_font("Helvetica", "B", 12)
        pdf.multi_cell(0, 8, heading)
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, LINE_H, body)
        pdf.ln(7)

    pdf.output(str(OUTPUT_DIR / filename))
    print(f"  generated  {filename}  ({pdf.page} pages)")


# -- Document 1: Attention Mechanisms and Transformer Networks -----------------

make_pdf(
    "attention-is-all-you-need.pdf",
    "Attention Mechanisms and Transformer Networks",
    [
        (
            "Abstract",
            "Modern natural language processing rests on a single architectural "
            "insight: that a machine can learn which words in a sentence matter "
            "most for understanding any other word, without processing text "
            "step by step. This document explains the transformer architecture, "
            "the self-attention mechanism at its core, and why it changed the "
            "field of machine learning permanently.",
        ),
        (
            "1. The Problem with Processing Language Word by Word",
            "Before transformers, the dominant approach to language modelling was "
            "the recurrent neural network (RNN). An RNN reads a sentence from left "
            "to right, maintaining a hidden state that summarises everything seen "
            "so far. This works for short sentences, but it has a fundamental "
            "weakness: information from early words gets diluted as the sequence "
            "grows longer. By the time the network reaches the end of a paragraph, "
            "the signal from the opening sentence has faded.\n\n"
            "Long Short-Term Memory networks (LSTMs) and Gated Recurrent Units "
            "(GRUs) were invented to mitigate this problem, using learnable gates "
            "to decide what to remember and what to forget. They helped, but they "
            "did not solve the root cause: sequential processing forces each step "
            "to wait for the previous one, making training slow and limiting the "
            "effective reach of context.\n\n"
            "What researchers needed was a way to let every word in a sentence "
            "directly communicate with every other word, in parallel, without "
            "the bottleneck of a hidden state.",
        ),
        (
            "2. The Self-Attention Mechanism",
            "Self-attention solves this by asking, for every word in the input: "
            "which other words should I pay attention to when forming my "
            "representation?\n\n"
            "Each word is projected into three vectors: a Query (what am I "
            "looking for?), a Key (what do I contain?), and a Value (what "
            "information do I carry?). The attention score between two words "
            "is the dot product of the first word's Query with the second "
            "word's Key, scaled by the square root of the dimension to prevent "
            "the dot products from growing too large. A softmax function turns "
            "these raw scores into a probability distribution, and the output "
            "is the weighted sum of all Value vectors.\n\n"
            "The result is that 'bank' in 'river bank' and 'bank' in 'savings "
            "bank' produce different representations, because the surrounding "
            "words they attend to are different. Meaning emerges from context, "
            "not from a lookup table.",
        ),
        (
            "3. Multi-Head Attention",
            "A single attention operation captures one type of relationship. "
            "Multi-head attention runs several attention operations in parallel, "
            "each with its own learned Query, Key, and Value projections. The "
            "outputs are concatenated and projected back to the model dimension.\n\n"
            "Different heads specialise: one head might track syntactic subject-"
            "verb agreement, another might link pronouns to their antecedents, "
            "a third might capture semantic similarity between concepts. The "
            "model learns which relationships matter for the task at hand.\n\n"
            "The original transformer used eight attention heads. Larger models "
            "use dozens. Each head operates on a lower-dimensional subspace, "
            "so the total computation is similar to a single full-dimensional "
            "attention pass.",
        ),
        (
            "4. Positional Encoding",
            "Self-attention is permutation-invariant: shuffle the words and the "
            "attention scores change, but the mechanism has no built-in notion "
            "of order. To give the model positional information, a positional "
            "encoding is added to each word embedding before the first layer.\n\n"
            "The original design used sine and cosine functions at different "
            "frequencies, one for each dimension of the embedding. This allows "
            "the model to generalise to sequence lengths it has not seen during "
            "training. Later models learned the positional encodings directly "
            "from data, which works well for fixed maximum sequence lengths.",
        ),
        (
            "5. The Encoder-Decoder Architecture",
            "The original transformer was designed for sequence-to-sequence "
            "tasks such as machine translation. It consists of an encoder, which "
            "reads the input sentence and produces a sequence of contextual "
            "representations, and a decoder, which generates the output sentence "
            "one token at a time, attending to the encoder's output at each step.\n\n"
            "Encoder-only models such as BERT (Bidirectional Encoder "
            "Representations from Transformers) are pre-trained to reconstruct "
            "masked words, making them powerful for understanding tasks like "
            "classification and question answering. Decoder-only models such as "
            "the GPT family are pre-trained to predict the next token, making "
            "them powerful for text generation. Encoder-decoder models remain "
            "the standard for translation and summarisation.",
        ),
        (
            "6. Why Transformers Dominate",
            "Three properties made transformers the default architecture for "
            "language and beyond:\n\n"
            "Parallelism: because attention is computed all at once rather than "
            "step by step, transformers train much faster than RNNs on modern "
            "hardware with many parallel processors.\n\n"
            "Long-range dependencies: every token attends to every other token "
            "in a single operation, with no degradation over distance. A model "
            "can relate the first word of a document to the last as easily as "
            "two adjacent words.\n\n"
            "Scalability: adding parameters consistently improves performance. "
            "This scaling law, combined with the abundance of text data on the "
            "internet, enabled the large language model era. Models with hundreds "
            "of billions of parameters now handle translation, coding, reasoning, "
            "and open-ended conversation at levels that were unimaginable a "
            "decade ago.",
        ),
    ],
)

# -- Document 2: Black Holes and Extreme Gravity -------------------------------

make_pdf(
    "first-black-hole-image.pdf",
    "Black Holes and the Limits of Spacetime",
    [
        (
            "Abstract",
            "A black hole is a region of space where gravity is so intense that "
            "nothing -- not matter, not radiation, not light itself -- can escape "
            "once it crosses the boundary known as the event horizon. This document "
            "explains what black holes are, how they form, how scientists detected "
            "and eventually photographed them, and why they represent the most "
            "extreme environments in the known universe.",
        ),
        (
            "1. What Is a Black Hole?",
            "According to general relativity, massive objects curve the fabric of "
            "spacetime around them. The more mass concentrated in a given volume, "
            "the more severe the curvature. A black hole arises when mass is "
            "compressed so completely that the escape velocity -- the speed needed "
            "to break free of its gravity -- exceeds the speed of light.\n\n"
            "Because nothing travels faster than light, anything that falls inside "
            "the event horizon is trapped forever. The event horizon is not a "
            "physical surface; it is a mathematical boundary, a point of no return "
            "in spacetime. An observer falling through it would notice nothing "
            "special at the moment of crossing -- but from that point on, all "
            "possible trajectories lead inward.",
        ),
        (
            "2. The Schwarzschild Radius",
            "For any mass, there is a critical radius at which it would become a "
            "black hole if compressed to that size. This is the Schwarzschild "
            "radius, named after Karl Schwarzschild who derived it in 1916 "
            "from Einstein's field equations.\n\n"
            "For the Earth, the Schwarzschild radius is about nine millimetres "
            "-- the planet would need to be squeezed to the size of a marble to "
            "become a black hole. For the Sun, it is roughly three kilometres. "
            "Stellar black holes, formed from the collapse of massive stars, "
            "have Schwarzschild radii of a few to a few tens of kilometres, "
            "yet they can contain ten to fifty times the mass of our Sun.",
        ),
        (
            "3. How Black Holes Form",
            "Stellar black holes are the endpoints of the most massive stars. "
            "When a star more than roughly twenty times the mass of the Sun "
            "exhausts its nuclear fuel, the outward pressure from fusion can no "
            "longer balance the inward pull of gravity. The core collapses in "
            "milliseconds, triggering a supernova explosion that blasts the outer "
            "layers into space. If the remaining core exceeds about three solar "
            "masses, no known force can stop the collapse, and a black hole forms.\n\n"
            "Supermassive black holes, found at the centres of most large galaxies, "
            "contain millions to billions of solar masses. Their origin is still "
            "debated -- they may grow from smaller black holes merging, or from "
            "the direct collapse of enormous gas clouds in the early universe.",
        ),
        (
            "4. The Accretion Disk and Jets",
            "Matter falling toward a black hole does not fall straight in. "
            "Conservation of angular momentum causes it to spiral, forming a "
            "flattened structure of superheated gas called an accretion disk. "
            "Friction within the disk raises temperatures to millions of degrees, "
            "causing it to radiate powerfully across the electromagnetic spectrum, "
            "including X-rays. This is why black holes, despite trapping light, "
            "are among the brightest objects in the universe -- it is the "
            "surrounding matter, not the hole itself, that shines.\n\n"
            "Magnetic fields threading the accretion disk can launch jets of "
            "plasma perpendicular to the disk at nearly the speed of light. "
            "These jets, extending millions of light-years, are visible across "
            "the cosmos and are the most energetic continuous outflows known.",
        ),
        (
            "5. Imaging a Black Hole: The Event Horizon Telescope",
            "In April 2019, the Event Horizon Telescope collaboration published "
            "the first direct image of a black hole shadow -- a dark region "
            "surrounded by a bright ring of light bent by gravity around the "
            "supermassive black hole at the centre of the galaxy M87, located "
            "55 million light-years from Earth.\n\n"
            "The image was produced by a network of radio telescopes on different "
            "continents, coordinated to act as a single Earth-sized dish using "
            "a technique called very long baseline interferometry (VLBI). The "
            "angular resolution achieved was equivalent to reading a newspaper "
            "in New York from a cafe in Paris.\n\n"
            "The bright ring is caused by photons orbiting the black hole just "
            "outside the photon sphere before escaping toward us. The asymmetry "
            "in brightness across the ring reflects the rotation of the gas: "
            "the side moving toward us appears brighter due to the Doppler effect.",
        ),
        (
            "6. Hawking Radiation and Black Hole Evaporation",
            "In 1974, Stephen Hawking showed theoretically that black holes are "
            "not perfectly black. Quantum effects near the event horizon cause "
            "the black hole to emit thermal radiation -- now called Hawking "
            "radiation -- and slowly lose mass over time.\n\n"
            "The effect arises because quantum mechanics allows pairs of virtual "
            "particles to briefly pop into existence near the horizon. Occasionally "
            "one falls in while the other escapes, carrying energy away from the "
            "black hole. For stellar or supermassive black holes, the temperature "
            "of Hawking radiation is far below the cosmic microwave background, "
            "making evaporation negligible on any practical timescale. Small "
            "primordial black holes, however, could have evaporated by now.",
        ),
    ],
)

# -- Document 3: Reinforcement Learning ----------------------------------------

make_pdf(
    "dqn-atari-games.pdf",
    "Learning Through Reward: Reinforcement Learning and Game Playing",
    [
        (
            "Abstract",
            "Reinforcement learning is a family of algorithms that teach an agent "
            "to make decisions by rewarding it for good outcomes and penalising it "
            "for bad ones. Unlike supervised learning, which requires labelled "
            "examples, reinforcement learning discovers strategy entirely through "
            "trial and error. This document introduces the core concepts, the "
            "Q-learning algorithm, deep Q-networks, and the landmark result of "
            "an agent learning to play dozens of Atari video games from raw pixels "
            "alone, reaching superhuman performance on many of them.",
        ),
        (
            "1. The Reinforcement Learning Problem",
            "In reinforcement learning, an agent interacts with an environment "
            "over a sequence of time steps. At each step, the agent observes the "
            "current state of the environment, selects an action, and receives a "
            "scalar reward signal telling it how good or bad that action was. "
            "The goal is to learn a policy -- a mapping from states to actions -- "
            "that maximises the cumulative reward over time.\n\n"
            "The challenge is that rewards may be delayed. A chess move might "
            "seem neutral now but prove decisive twenty moves later. The agent "
            "must learn to assign credit backward through time to actions that "
            "led to eventual success -- a problem called temporal credit assignment.",
        ),
        (
            "2. Markov Decision Processes",
            "Reinforcement learning problems are formally modelled as Markov "
            "Decision Processes (MDPs). An MDP consists of a set of states, a "
            "set of actions available in each state, a transition function that "
            "describes how the environment moves from one state to another given "
            "an action, and a reward function that specifies the immediate payoff.\n\n"
            "The Markov property requires that the next state depends only on "
            "the current state and action, not on the full history. In practice "
            "many environments satisfy this property approximately, especially "
            "when the state representation is rich enough.",
        ),
        (
            "3. Q-Learning",
            "Q-learning is a foundational reinforcement learning algorithm that "
            "learns the value of taking each action in each state. The Q-function, "
            "Q(state, action), represents the expected total future reward when "
            "taking a specific action in a specific state and then following the "
            "optimal policy thereafter.\n\n"
            "The Bellman equation provides a recursive relationship: the Q-value "
            "of a state-action pair equals the immediate reward plus the discounted "
            "maximum Q-value of the next state. Q-learning updates its estimates "
            "incrementally after each step, gradually converging toward the true "
            "Q-function. Once learned, the policy simply selects the action with "
            "the highest Q-value in each state.\n\n"
            "The exploration-exploitation dilemma requires balancing trying new "
            "actions (exploration) with repeating known good actions (exploitation). "
            "The epsilon-greedy strategy handles this by taking a random action "
            "with probability epsilon and the greedy action otherwise, gradually "
            "reducing epsilon over training.",
        ),
        (
            "4. Deep Q-Networks",
            "Classical Q-learning stores a table with one entry per state-action "
            "pair. This is infeasible for large state spaces. A video game screen "
            "with 84 by 84 pixels and 256 possible colours per pixel has far more "
            "states than atoms in the observable universe.\n\n"
            "Deep Q-Networks (DQN) solve this by approximating the Q-function "
            "with a deep convolutional neural network. The network takes raw "
            "pixel frames as input and outputs Q-values for every possible action. "
            "Two innovations made training stable: experience replay, which stores "
            "past transitions and samples them randomly to break correlations; "
            "and a separate target network, which is updated only periodically "
            "to provide stable training targets.",
        ),
        (
            "5. Playing Atari from Pixels",
            "The DQN algorithm was applied without modification to 49 different "
            "Atari 2600 games, using only raw pixel frames and the game score as "
            "input. The agent was given no prior knowledge about the rules of any "
            "game, no hand-crafted features, and no game-specific tuning.\n\n"
            "The same algorithm, with the same hyperparameters, achieved human-"
            "level or superhuman performance on a majority of games. It excelled "
            "particularly at games requiring precise timing and planning, such as "
            "Breakout, where it discovered the strategy of tunnelling through the "
            "side of the brick wall -- a technique that human players also converge "
            "on but which the agent found entirely through self-play.\n\n"
            "Games involving long-term planning, such as Montezuma's Revenge, "
            "remained challenging, motivating later research into curiosity-driven "
            "exploration and hierarchical reinforcement learning.",
        ),
        (
            "6. Beyond Atari",
            "The success of DQN on Atari triggered rapid advances. AlphaGo "
            "combined deep reinforcement learning with Monte Carlo tree search "
            "to defeat the world Go champion in 2016 -- a game with more board "
            "positions than atoms in the universe, long considered beyond the "
            "reach of machines.\n\n"
            "AlphaZero later mastered chess, Go, and shogi from scratch using "
            "only self-play, with no human game records. OpenAI Five learned to "
            "play the complex strategy game Dota 2 at the professional level "
            "through billions of games against itself. Reinforcement learning "
            "now trains the language models that power modern AI assistants, "
            "robot manipulation systems, and drug discovery pipelines.",
        ),
    ],
)

# -- Document 4: Infectious Disease Transmission -------------------------------

make_pdf(
    "covid19-epidemiology.pdf",
    "How Infectious Diseases Spread: Epidemiology and Transmission Dynamics",
    [
        (
            "Abstract",
            "The spread of an infectious disease through a population follows "
            "mathematical laws that can be modelled, predicted, and interrupted. "
            "Understanding transmission dynamics -- how a pathogen moves from "
            "person to person, how fast it spreads, and when an outbreak becomes "
            "an epidemic -- is essential for designing effective public health "
            "responses. This document covers the fundamental concepts of "
            "epidemiology including the basic reproduction number, compartmental "
            "models, herd immunity, and the role of asymptomatic transmission.",
        ),
        (
            "1. The Basic Reproduction Number R0",
            "The most important single number in epidemiology is R0, the basic "
            "reproduction number, pronounced R-naught. It represents the average "
            "number of new infections generated by a single infected individual "
            "in a completely susceptible population.\n\n"
            "If R0 is less than one, each case produces less than one new case "
            "on average, and the outbreak fades. If R0 equals one, the disease "
            "circulates at a steady level. If R0 exceeds one, cases multiply "
            "exponentially -- each infected person infects more than one other, "
            "and the disease spreads through the population.\n\n"
            "The value of R0 depends on three factors: the probability of "
            "transmission per contact, the rate of contact between infected and "
            "susceptible individuals, and the duration of the infectious period. "
            "Interventions reduce the effective reproduction number, denoted Rt, "
            "by reducing any of these three components.",
        ),
        (
            "2. The SIR Model",
            "The SIR model divides a population into three compartments: "
            "Susceptible (S), Infectious (I), and Recovered (R). Susceptible "
            "individuals have not yet been infected and can catch the disease. "
            "Infectious individuals carry the pathogen and can transmit it. "
            "Recovered individuals have cleared the infection and are assumed "
            "to be immune.\n\n"
            "The model tracks how individuals move between compartments over "
            "time using differential equations. The rate at which susceptibles "
            "become infected depends on the contact rate, the transmission "
            "probability, and the fraction of the population that is currently "
            "infectious. The rate of recovery depends on the duration of the "
            "infectious period.\n\n"
            "Despite its simplicity, the SIR model captures the characteristic "
            "shape of an epidemic curve: a rapid rise as the pathogen finds "
            "many susceptible hosts, a peak when the susceptible pool is "
            "depleted enough to slow spread, and a decline as immunity accumulates.",
        ),
        (
            "3. The Silent Spread: Asymptomatic and Presymptomatic Transmission",
            "One of the most consequential features of some pathogens is the "
            "ability to spread before the infected person shows any symptoms. "
            "In presymptomatic transmission, individuals are infectious during "
            "the incubation period, before illness begins. In asymptomatic "
            "transmission, some individuals never develop symptoms at all but "
            "still shed the pathogen.\n\n"
            "Silent transmission makes outbreaks far harder to detect and control. "
            "Conventional containment strategies -- isolating the sick -- fail when "
            "infectious individuals feel healthy and go about their normal lives. "
            "Contact tracing, testing, and mask-wearing become critical tools "
            "because they address transmission that isolation alone cannot interrupt.\n\n"
            "Estimating the fraction of transmission that occurs before symptom "
            "onset requires careful epidemiological investigation: studying chains "
            "of transmission, measuring the serial interval between cases, and "
            "comparing it to the incubation period distribution.",
        ),
        (
            "4. Herd Immunity",
            "As a disease spreads and people recover, the pool of susceptible "
            "individuals shrinks. The effective reproduction number Rt falls as "
            "more of the population becomes immune, because infectious individuals "
            "encounter fewer susceptible contacts. When enough of the population "
            "is immune, Rt falls below one and the outbreak declines even without "
            "further intervention.\n\n"
            "The herd immunity threshold is the fraction of the population that "
            "must be immune to push Rt below one. It equals 1 minus 1 divided "
            "by R0. For a disease with R0 of 4, roughly 75 percent of the "
            "population must be immune. For measles, with R0 of 12 to 18, the "
            "threshold is above 90 percent.\n\n"
            "Vaccination can reach the herd immunity threshold without the disease "
            "itself causing widespread illness. This is why vaccination campaigns "
            "that fall short of the threshold can still allow outbreaks to smoulder.",
        ),
        (
            "5. Pandemic Dynamics and Waves",
            "A pandemic occurs when an infectious disease spreads across multiple "
            "countries or continents. Pandemic dynamics are shaped by the global "
            "movement of people, by the introduction of the pathogen into new "
            "populations with no prior immunity, and by the heterogeneous "
            "connectivity of social networks.\n\n"
            "Epidemics often arrive in waves, with periods of intense spread "
            "followed by lulls. Waves can be driven by seasonal factors affecting "
            "transmission, by relaxation of behavioural countermeasures, by the "
            "emergence of new variants with higher transmissibility or immune "
            "escape, or by the gradual waning of immunity in recovered individuals.\n\n"
            "Mathematical models incorporating age structure, spatial heterogeneity, "
            "and waning immunity are used by public health agencies to project "
            "future case counts, hospital demand, and the impact of interventions "
            "such as vaccination campaigns and non-pharmaceutical measures.",
        ),
    ],
)

# -- Document 5: Climate Tipping Points ----------------------------------------

make_pdf(
    "climate-tipping-points.pdf",
    "Climate Tipping Points and Feedback Loops",
    [
        (
            "Abstract",
            "The Earth's climate system contains components that can shift "
            "abruptly and permanently from one stable state to another when "
            "pushed beyond a threshold. These are called climate tipping points. "
            "Once crossed, some tipping points trigger self-reinforcing feedback "
            "loops that continue to drive warming even if human emissions stop. "
            "This document explains the physics of climate feedback, identifies "
            "the most critical tipping elements, and discusses the risks of "
            "cascading instability across the climate system.",
        ),
        (
            "1. The Greenhouse Effect and Radiative Forcing",
            "The Earth receives energy from the Sun as shortwave radiation and "
            "returns energy to space as longwave infrared radiation. Greenhouse "
            "gases -- primarily water vapour, carbon dioxide (CO2), methane, and "
            "nitrous oxide -- absorb outgoing longwave radiation and re-emit it "
            "in all directions, including back toward the surface. This greenhouse "
            "effect keeps the planet roughly 33 degrees Celsius warmer than it "
            "would otherwise be.\n\n"
            "Radiative forcing measures the change in energy flux at the top of "
            "the atmosphere caused by a change in atmospheric composition. Doubling "
            "atmospheric CO2 from pre-industrial levels produces a radiative "
            "forcing of approximately 3.7 watts per square metre, before any "
            "feedbacks amplify or dampen the initial warming.",
        ),
        (
            "2. Feedback Loops: Amplifiers and Dampeners",
            "Climate feedbacks are processes that respond to an initial warming "
            "and either amplify it (positive feedback) or reduce it (negative "
            "feedback). The climate sensitivity -- how much warming results from "
            "a doubling of CO2 -- depends critically on the balance of these feedbacks.\n\n"
            "The water vapour feedback is the strongest positive feedback. As the "
            "atmosphere warms, it holds more water vapour, which is itself a "
            "greenhouse gas, amplifying the initial warming by roughly a factor of two.\n\n"
            "The ice-albedo feedback is another powerful amplifier. Ice and snow "
            "are highly reflective, returning most incoming solar energy to space. "
            "As warming melts ice, it exposes darker ocean or land surfaces that "
            "absorb more sunlight, causing further warming that melts more ice.\n\n"
            "The Planck response -- the increase in outgoing radiation as a warmer "
            "surface radiates more energy -- is the primary negative feedback that "
            "ultimately stabilises the climate at a new, warmer equilibrium.",
        ),
        (
            "3. Critical Tipping Elements",
            "Climate scientists have identified a set of large-scale components "
            "of the Earth system that may have tipping points -- thresholds beyond "
            "which they shift to a qualitatively different state that persists "
            "even if the forcing is subsequently reduced.\n\n"
            "The Greenland Ice Sheet stores enough ice to raise global sea levels "
            "by approximately seven metres. Above a threshold warming of around "
            "1.5 to 2 degrees Celsius above pre-industrial temperatures, melt "
            "rates may exceed accumulation rates permanently. Because ice loss "
            "lowers the surface elevation, bringing ice into warmer air, the "
            "process becomes self-sustaining.\n\n"
            "The West Antarctic Ice Sheet is considered potentially unstable due "
            "to marine ice sheet instability: much of it rests on bedrock below "
            "sea level, sloping inward, so that as the grounding line retreats "
            "the ice sheet becomes progressively less stable.\n\n"
            "The Amazon rainforest generates much of its own rainfall through "
            "transpiration. Deforestation combined with drought can push parts "
            "of the system toward a savannification tipping point, releasing "
            "vast stores of carbon and eliminating one of the largest carbon "
            "sinks on Earth.",
        ),
        (
            "4. Permafrost Thaw and Carbon Release",
            "Permafrost -- ground that remains frozen year-round -- covers "
            "approximately a quarter of the Northern Hemisphere's land area. "
            "It stores roughly 1.5 trillion tonnes of organic carbon, roughly "
            "double the amount currently in the atmosphere, accumulated over "
            "thousands of years from plant and animal remains that could not "
            "decompose in frozen soil.\n\n"
            "As the Arctic warms at more than twice the global average rate, "
            "permafrost thaws and previously frozen organic matter begins to "
            "decompose. Microbial activity releases CO2 under dry aerobic "
            "conditions and methane under wet anaerobic conditions. Methane is "
            "roughly 80 times more potent as a greenhouse gas than CO2 over a "
            "20-year period.\n\n"
            "Permafrost thaw is a slow-onset process but it is effectively "
            "irreversible on human timescales. Once started, the decomposition "
            "continues for decades or centuries, adding to atmospheric greenhouse "
            "gas concentrations independently of human actions.",
        ),
        (
            "5. Cascading Instabilities",
            "Perhaps the most alarming possibility is that crossing one tipping "
            "point could push the climate system toward others, triggering a "
            "cascade of irreversible changes even if total warming remains below "
            "formal danger thresholds.\n\n"
            "For example, Greenland ice loss adds cold freshwater to the North "
            "Atlantic, which could weaken the Atlantic Meridional Overturning "
            "Circulation (AMOC) -- the system of ocean currents that carries "
            "heat northward and moderates European climate. A weakened AMOC "
            "would shift monsoon rainfall patterns, stress the Amazon ecosystem, "
            "and alter sea ice in the Southern Ocean, each of which has its "
            "own potential tipping dynamics.\n\n"
            "Research suggests that the risk of triggering interacting tipping "
            "points rises significantly above 1.5 degrees Celsius of global "
            "warming and becomes severe above 2 degrees. This provides a "
            "physical basis for the temperature limits in international climate "
            "agreements, beyond the direct impacts on human society and ecosystems.",
        ),
        (
            "6. The Urgency of Emissions Reduction",
            "The window to prevent the most dangerous tipping points from being "
            "crossed is narrowing. Current trajectories of greenhouse gas "
            "emissions, if continued, are projected to produce warming of 2.5 "
            "to 4 degrees Celsius above pre-industrial levels by 2100, well "
            "into the range where multiple tipping points may be triggered.\n\n"
            "Stabilising warming requires net CO2 emissions to reach zero. "
            "Because CO2 accumulates in the atmosphere over centuries, every "
            "tonne emitted today contributes to warming for generations. The "
            "carbon budget -- the total amount of CO2 that can still be emitted "
            "while limiting warming to 1.5 degrees Celsius -- is estimated at "
            "a few hundred billion tonnes at current emission rates, representing "
            "only a few years of global emissions at the current pace.",
        ),
    ],
)

print("Done.")
