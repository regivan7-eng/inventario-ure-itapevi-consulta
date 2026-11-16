(() => {
 const host=typeof window==='object'?window:globalThis;
 // Display convention only. Do not remove letters inside a school's name.
 const display=value=>String(value??'').trim().replace(/^(?:(?:E\s*\.\s*E\s*\.|EE)\s+(?:[-–—:]\s*)?)+/iu,'').trim();
 host.inventorySchoolNames={display};
})();
