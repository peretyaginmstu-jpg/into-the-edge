// Journey "drill": from a gold-coated drill bit in the hand down to the atoms of its coating.
// Every number below comes from the project brief and its sources; texts are in i18n/<lang>.json
// under the "drill" key. Field of view means the shorter side of the screen.

export default {
  id: 'drill',
  seed: 20261018,
  repository: 'https://github.com/peretyaginmstu-jpg/into-the-edge',
  siteUrl: 'https://peretyaginmstu-jpg.github.io/into-the-edge/',
  author: {
    links: [
      { id: 'linkedin', url: 'https://www.linkedin.com/in/pavel-peretyagin/' },
      { id: 'github', url: 'https://github.com/peretyaginmstu-jpg' },
    ],
  },

  // Extra scroll past the last level, in decades of zoom, that reveals the final screen.
  finalStretch: 0.35,
  autopilot: { hold: 3.2 },

  // The path: 8 levels and one transition. fov = field of view, [value, unit].
  // sources: support the caption and the comparison object; card: the researcher card.
  stops: [
    { id: '0', fov: [20, 'cm'], sources: ['walter'], card: ['teti2010'] },
    { id: '1', fov: [2, 'cm'], sources: [], card: ['melkote2017'] },
    { id: '2', fov: [0.5, 'mm'], sources: ['denkena2014', 'wolfram2003'], card: ['arrazola2013'] },
    { id: '2b', fov: [100, 'um'], transition: true, sources: ['giannuzzi1999', 'wolfram2003'] },
    { id: '3', fov: [15, 'um'], sources: ['dabees2022', 'garcia2019', 'bionumbers100798'], card: ['bull2006'] },
    { id: '4', fov: [2, 'um'], sources: ['petrov2003', 'bionumbers102065'], card: ['anders2010'] },
    { id: '5', fov: [150, 'nm'], sources: ['helmersson1987', 'noda2012'], card: ['iso14577', 'berg1993'] },
    { id: '6', fov: [3, 'nm'], sources: ['abrikosov2011', 'watson1953'], card: ['mayrhofer2003', 'alling2009', 'norrby2012'] },
    { id: '7', fov: [5, 'A'], sources: ['batatia2022', 'deng2023', 'bionumbers103723'], card: ['bowler2012', 'deng2025'] },
  ],

  // Familiar objects drawn as outlines at true scale. `at` is the position inside the
  // square reference frame (0..1 from its top left corner); size is the drawn size.
  // The hand of level 0 is part of the drill scene itself.
  comparisons: [
    { id: 'hair', shape: 'hair', size: [70, 'um'], label: 'hair', stops: ['2', '2b'], at: [0.9, 0.1], angle: -32, atPortrait: [0.92, 0.02], anglePortrait: -58 },
    { id: 'rbc', shape: 'rbc', size: [8, 'um'], label: 'rbc', stops: ['3'], at: [0.5, 0.14], atPortrait: [0.5, 0.12] },
    { id: 'ecoli', shape: 'ecoli', size: [2, 'um'], label: 'ecoli', stops: ['4'], at: [0.5, 0.79], atPortrait: [0.5, 0.74] },
    { id: 'virus', shape: 'virus', size: [100, 'nm'], label: 'virus', stops: ['5'], at: [0.82, 0.26], atPortrait: [0.5, 0.36] },
    { id: 'dna', shape: 'dna', size: [2, 'nm'], label: 'dna', stops: ['6'], at: [-0.13, 0.5], atPortrait: [0.02, 0.5], alpha: 0.85, labelAt: [-0.1, 0.2], labelAtPortrait: [0.42, 0.03] },
    { id: 'water', shape: 'water', size: [0.28, 'nm'], label: 'water', stops: ['7'], at: [0.86, 0.2], atPortrait: [0.72, 0.24], alpha: 0.85, labelAt: [0.86, 0.52], labelAtPortrait: [0.62, 0.56] },
  ],

  // Scenes are drawn over z = log10(field of view in metres) ranges: [outer, inner].
  // An inner scene fades in on top of the outer one across fadeIn.
  scenes: [
    { id: 'drill', module: '../js/scenes/drill.js', range: [1, -4.66], params: { handCentre: [-14, -56] } },
    { id: 'section', module: '../js/scenes/section.js', range: [-4.56, -8.3], fadeIn: [-4.56, -4.66], params: { style: [-5.85, -6.55], mask: [-7.85, -8.12] } },
    { id: 'lattice', module: '../js/scenes/lattice.js', range: [-8.1, -12], fadeIn: [-8.1, -8.28], params: { cell: 0.42, cells: 5, alFraction: 0.5 } },
  ],

  sources: {
    abrikosov2011: { text: 'Abrikosov I.A. et al. (2011) Phase stability and elasticity of TiAlN. Materials 4(9), 1599–1618.', url: 'https://doi.org/10.3390/ma4091599' },
    alling2009: { text: 'Alling B., Odén M., Hultman L., Abrikosov I.A. (2009) Pressure enhancement of the isostructural cubic decomposition in Ti1−xAlxN. Appl. Phys. Lett. 95, 181906.', url: 'https://doi.org/10.1063/1.3256196' },
    anders2010: { text: 'Anders A. (2010) A structure zone diagram including plasma-based deposition and ion etching. Thin Solid Films 518(15), 4087–4090.', url: 'https://doi.org/10.1016/j.tsf.2009.10.145' },
    arrazola2013: { text: 'Arrazola P.J. et al. (2013) Recent advances in modelling of metal machining processes. CIRP Annals 62(2), 695–718.', url: 'https://doi.org/10.1016/j.cirp.2013.05.006' },
    batatia2022: { text: 'Batatia I. et al. (2022) MACE: Higher order equivariant message passing neural networks for fast and accurate force fields. NeurIPS 35, 11423–11436. arXiv:2206.07697', url: 'https://arxiv.org/abs/2206.07697' },
    berg1993: { text: "Berg G., Grau P. (1993) Influence of the substrate hardness on the validity of Bückle's rule. Cryst. Res. Technol. 28(7), 989–994.", url: 'https://doi.org/10.1002/crat.2170280722' },
    bionumbers100798: { text: 'BioNumbers, record 100798 (red blood cell).', url: 'https://bionumbers.hms.harvard.edu/bionumber.aspx?id=100798' },
    bionumbers102065: { text: 'BioNumbers, record 102065 (E. coli).', url: 'https://bionumbers.hms.harvard.edu/bionumber.aspx?id=102065' },
    bionumbers103723: { text: 'BioNumbers, record 103723 (water molecule).', url: 'https://bionumbers.hms.harvard.edu/bionumber.aspx?id=103723' },
    bowler2012: { text: 'Bowler D.R., Miyazaki T. (2012) O(N) methods in electronic structure calculations. Rep. Prog. Phys. 75, 036503.', url: 'https://doi.org/10.1088/0034-4885/75/3/036503' },
    bull2006: { text: 'Bull S.J., Berasetegui E.G. (2006) An overview of the potential of quantitative coating adhesion measurement by scratch testing. Tribol. Int. 39(2), 99–114.', url: 'https://doi.org/10.1016/j.triboint.2005.04.013' },
    dabees2022: { text: 'Dabees S. et al. (2022) Characterization and evaluation of engineered coating techniques for different cutting tools: review. Materials 15, 5633.', url: 'https://doi.org/10.3390/ma15165633' },
    deng2023: { text: 'Deng B. et al. (2023) CHGNet as a pretrained universal neural network potential for charge-informed atomistic modelling. Nat. Mach. Intell. 5, 1031–1041.', url: 'https://doi.org/10.1038/s42256-023-00716-3' },
    deng2025: { text: 'Deng B. et al. (2025) Systematic softening in universal machine learning interatomic potentials. npj Comput. Mater. 11, 9.', url: 'https://doi.org/10.1038/s41524-024-01500-6' },
    denkena2014: { text: 'Denkena B., Biermann D. (2014) Cutting edge geometries. CIRP Annals 63(2), 631–653.', url: 'https://doi.org/10.1016/j.cirp.2014.05.009' },
    garcia2019: { text: 'García J. et al. (2019) Cemented carbide microstructures: a review. Int. J. Refract. Met. Hard Mater. 80, 40–68.', url: 'https://doi.org/10.1016/j.ijrmhm.2018.12.004' },
    giannuzzi1999: { text: 'Giannuzzi L.A., Stevie F.A. (1999) A review of focused ion beam milling techniques for TEM specimen preparation. Micron 30(3), 197–204.', url: 'https://doi.org/10.1016/S0968-4328(99)00005-0' },
    helmersson1987: { text: 'Helmersson U. et al. (1987) Growth of single-crystal TiN/VN strained-layer superlattices with extremely high mechanical hardness. J. Appl. Phys. 62(2), 481–484.', url: 'https://doi.org/10.1063/1.339770' },
    iso14577: { text: 'ISO 14577-4:2016. Instrumented indentation test, part 4: test method for metallic and non-metallic coatings.', url: 'https://www.iso.org/standard/61823.html' },
    mayrhofer2003: { text: 'Mayrhofer P.H. et al. (2003) Self-organized nanostructures in the Ti–Al–N system. Appl. Phys. Lett. 83(10), 2049–2051.', url: 'https://doi.org/10.1063/1.1608464' },
    melkote2017: { text: 'Melkote S.N. et al. (2017) Advances in material and friction data for modelling of metal machining. CIRP Annals 66(2), 731–754.', url: 'https://doi.org/10.1016/j.cirp.2017.05.002' },
    noda2012: { text: 'Noda T. (2012) Native morphology of influenza virions. Front. Microbiol. 2, 269.', url: 'https://doi.org/10.3389/fmicb.2011.00269' },
    norrby2012: { text: "Norrby N., Johansson M.P., M'Saoubi R., Odén M. (2012) Pressure and temperature effects on the decomposition of arc evaporated Ti0.6Al0.4N coatings in continuous turning. Surf. Coat. Technol. 209, 203–207.", url: 'https://doi.org/10.1016/j.surfcoat.2012.08.068' },
    petrov2003: { text: 'Petrov I., Barna P.B., Hultman L., Greene J.E. (2003) Microstructural evolution during film growth. J. Vac. Sci. Technol. A 21(5), S117–S128.', url: 'https://doi.org/10.1116/1.1601610' },
    teti2010: { text: "Teti R., Jemielniak K., O'Donnell G., Dornfeld D. (2010) Advanced monitoring of machining operations. CIRP Annals 59(2), 717–739.", url: 'https://doi.org/10.1016/j.cirp.2010.05.010' },
    walter: { text: 'Walter AG. Patents US 7,758,975 B2 (2010) and US 9,476,114 B2 (2016) on a thin golden top layer that makes wear visible.', url: 'https://patents.google.com/patent/US7758975B2/en' },
    watson1953: { text: 'Watson J.D., Crick F.H.C. (1953) Molecular structure of nucleic acids. Nature 171, 737–738.', url: 'https://doi.org/10.1038/171737a0' },
    wolfram2003: { text: 'Wolfram L.J. (2003) Human hair: a unique physicochemical composite. J. Am. Acad. Dermatol. 48(6 Suppl), S106–S114.', url: 'https://doi.org/10.1067/mjd.2003.276' },
  },
};
