'use strict';
// Editable vector studies for the Gallery prototype. No external assets.
const fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(__dirname,'../site/flash-gallery');
const projects=JSON.parse(fs.readFileSync(path.join(directory,'prototype-projects.json'),'utf8'));
const symbols=[
 '<path d="M190 370V180Q190 85 285 85H420V185H310Q290 185 290 210V370ZM810 160V350Q810 445 715 445H580V345H690Q710 345 710 320V160Z"/><path d="M395 220H605V310H395Z"/>',
 '<path d="M135 265H865" stroke="#000" stroke-width="58"/><path d="M220 190V340M360 80V450M500 150V380M640 20V510M780 150V380" stroke="#000" stroke-width="78" stroke-linecap="round"/>',
 '<path d="M55 100H660L505-55H660L995 270 660 595H505L660 440H55V340H770V200H55Z"/>',
 '<circle cx="560" cy="268" r="215" fill="none" stroke="#000" stroke-width="84"/><circle cx="560" cy="268" r="71"/><circle cx="254" cy="92" r="65"/><circle cx="866" cy="444" r="65"/>',
 '<path d="M125 410V110H360V290H625V80H870" fill="none" stroke="#000" stroke-width="86"/><circle cx="125" cy="410" r="77"/><circle cx="870" cy="80" r="77"/>',
 '<path d="M180 0H345L820 530H655ZM-45 0H120L595 530H430ZM405 0H570L1045 530H880Z"/>',
 '<path d="M150 70H420V205H285V325H420V460H150ZM850 70H580V205H715V325H580V460H850Z"/><path d="M440 220H560V310H440Z"/>',
 '<path d="M500-25 585 150 780 80 710 275 885 360 690 410 700 600 500 490 300 600 310 410 115 360 290 275 220 80 415 150Z"/>',
 '<circle cx="360" cy="265" r="210"/><circle cx="570" cy="265" r="210" fill="none" stroke="#000" stroke-width="66"/><circle cx="780" cy="265" r="210" fill="none" stroke="#000" stroke-width="38"/>',
 '<path d="M80 185H920V345H80Z"/><path d="M175 30H335V500H175ZM665 30H825V500H665Z"/>',
 '<path d="M500 530V220" stroke="#000" stroke-width="68"/><path d="M470 335C180 360 145 95 190 35 390 40 515 140 470 335ZM530 335C820 360 855 95 810 35 610 40 485 140 530 335Z"/>',
 '<path d="M175 55H440V320H175ZM560 210H825V475H560Z"/><path d="M430 60H590V220H430ZM410 310H570V470H410Z"/>',
 '<path d="M500-20 554 184 735 67 625 245 840 265 625 286 735 464 554 347 500 550 446 347 265 464 375 286 160 265 375 245 265 67 446 184Z"/>',
 '<path d="M80 250 930 25 700 515 475 335 285 470 345 300Z"/><path d="M345 300 805 102 475 335" fill="none" stroke="COLOR" stroke-width="19"/>',
 '<path d="M75 265Q275-10 475 265 275 540 75 265ZM525 265Q725-10 925 265 725 540 525 265Z"/><circle cx="275" cy="265" r="62" fill="COLOR"/><circle cx="725" cy="265" r="62" fill="COLOR"/>',
 '<circle cx="500" cy="90" r="92"/><path d="M180 210H820V300H605L720 530H600L500 355 400 530H280L395 300H180Z"/>',
 '<path d="M90 340Q190 20 290 265T490 265T690 265T890 180" fill="none" stroke="#000" stroke-width="89" stroke-linecap="round"/>',
 '<path d="M170 40H670V490H170Z"/><path d="M290 160H570M290 260H570M290 360H450" stroke="COLOR" stroke-width="43"/><path d="M735 75H825V455H735Z" transform="rotate(14 780 265)"/>',
 '<path d="M225 130 500 405 775 130M225 130H775" fill="none" stroke="#000" stroke-width="48"/><circle cx="225" cy="130" r="105"/><circle cx="775" cy="130" r="105"/><circle cx="500" cy="405" r="105"/>',
 '<path d="M125 55H875V475H125Z"/><path d="M245 155H755V375H245Z" fill="COLOR"/><path d="M370 130H630V400H370Z"/><path d="M455 220H545V310H455Z" fill="COLOR"/>',
 '<path d="M95 450 290 65 485 450ZM515 65H905V455H515Z"/><circle cx="710" cy="260" r="94" fill="COLOR"/>',
 '<path d="M670-45A310 310 0 1 0 1020 305 230 230 0 0 1 670-45Z"/><path d="M245 50 270 135 355 160 270 185 245 270 220 185 135 160 220 135Z"/>',
 '<path d="M500 235C190-45 110 100 200 300L355 455C425 505 480 390 500 340 520 390 575 505 645 455L800 300C890 100 810-45 500 235Z"/><circle cx="500" cy="265" r="68" fill="COLOR"/>',
 '<path d="M120 50 480 265 120 480ZM510 50 870 265 510 480Z"/>',
 '<path d="M500-30 875 160V380L500 570 125 380V160Z"/><path d="M500 92 760 222 500 352 240 222Z" fill="COLOR"/><path d="M500 353V540" stroke="COLOR" stroke-width="22"/>',
 '<path d="M500 265C370-10 115 55 115 265S370 540 500 265C630-10 885 55 885 265S630 540 500 265Z" fill="none" stroke="#000" stroke-width="92"/>',
 '<path d="M130 470 495-55 870 470H705L495 175 295 470Z"/><path d="M410 360H975V490H410Z" transform="rotate(-25 690 425)"/>'
];
if(symbols.length!==projects.length-1)throw Error('One symbol per prototype required');
for(let i=1;i<projects.length;i++){
 const p=projects[i],symbol=symbols[i-1].replaceAll('COLOR',p.color);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="530" viewBox="0 0 1000 530"><rect width="1000" height="530" fill="'+p.color+'"/><g fill="#000">'+symbol+'</g></svg>';
 fs.writeFileSync(path.join(directory,'images',p.image),svg);
}
console.log('Created '+symbols.length+' editable SVG thumbnails. The supplied Square PNG is unchanged.');
