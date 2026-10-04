import re

with open('src/pages/HomePage.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

find = r'<div className=\"flex items-center gap-3\">\s*<span className=\"text-2xl hidden sm:block\">.*?</span>\s*<div className=\"flex flex-col\">\s*<span className=\"text-\[10px\] text-prodify-muted uppercase tracking-wider font-semibold\">Deflections</span>\s*<span className=\"text-white font-mono font-bold text-sm sm:text-base\">\{todayDistractions\} blocked</span>\s*</div>\s*</div>'

replace = '''<div className="flex items-center gap-3">
              <span className="text-2xl hidden sm:block">??</span>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Deep Work</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.deep_work_ratio_aggregate != null ? \\%\ : '—'}
                  <span className="text-[#888888] text-[10px] ml-1">7d</span>
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-2xl hidden sm:block">??</span>
              <div className="flex flex-col">
                <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Peak Window</span>
                <span className="text-white font-mono font-bold text-sm sm:text-base">
                  {homeMetrics?.peak_focus_window && !('insufficient_data' in homeMetrics.peak_focus_window) 
                    ? (homeMetrics.peak_focus_window as any).peak_range 
                    : 'Learning...'}
                </span>
              </div>
            </div>'''

c = re.sub(find, replace, c, flags=re.DOTALL)

with open('src/pages/HomePage.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Done")
