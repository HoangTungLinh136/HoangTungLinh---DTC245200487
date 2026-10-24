/**
 * QuizSystem — Azota-compatible Question & Exam Parser
 * Supports:
 * - Word (.docx) via mammoth.js
 * - Excel (.xlsx, .xls, .csv) via xlsx.js
 * - Plain text (.txt)
 * - Vietnamese exam standards (Azota, Quizizz, 789.vn):
 *   + Questions starting with "Câu 1:", "Câu 1.", "Bài 1:", "Question 1:", etc.
 *   + Choices "A.", "B.", "C.", "D." on separate or same lines
 *   + Correct answer marked with:
 *     * Asterisk: *A. or A*. or A. *Text
 *     * Inline answer line: "Đáp án: A" or "Đáp án: A, C"
 *     * Word underline / bold tag
 *     * End-of-text Answer Key Table: "BẢNG ĐÁP ÁN: 1.A  2.B  3.C..."
 *   + Difficulty tags: [Dễ], [Trung bình], [Khó], [Nhận biết], [Thông hiểu], [Vận dụng], [EASY], etc.
 *   + Subject tags: [Môn: ...], [Chủ đề: ...]
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AzotaParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cleanText(text) {
    return (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  /**
   * Parse plain text according to Azota specifications
   */
  function parseText(rawText, defaultSubject = 'Chung') {
    const text = cleanText(rawText);
    if (!text) {
      return {
        success: false,
        error: 'Văn bản trống hoặc không đọc được nội dung.',
        questions: [],
        stats: { total: 0, valid: 0, invalid: 0 }
      };
    }

    const lines = text.split('\n');

    // 1. Separate end-of-text Answer Key section if present
    // e.g. "BẢNG ĐÁP ÁN", "PHẦN ĐÁP ÁN", "ANSWER KEY", or standalone "ĐÁP ÁN:"
    let answerKeyMap = {};
    let contentLines = [];
    let inAnswerKeySection = false;

    const answerKeyHeaderRegex = /^(?:BẢNG\s+ĐÁP\s+ÁN|PHẦN\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN\s+CÁC\s+CÂU|ANSWER\s+KEY|KEY\s+ĐÁP\s+ÁN)[\s:：\-–—]*$|^ĐÁP\s+ÁN[\s:：\-–—]*$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (!inAnswerKeySection) contentLines.push(lines[i]);
        continue;
      }

      if (answerKeyHeaderRegex.test(line)) {
        inAnswerKeySection = true;
        continue;
      }

      if (inAnswerKeySection) {
        // Parse pairs: e.g. "1.A  2.B  3.C" or "1-A, 2-B" or "Câu 1: A"
        const keyMatches = line.matchAll(/(?:Câu\s*)?(\d+)[\s.:：\)\-–—]+([A-H](?:[\s,;]+[A-H])*)/gi);
        for (const m of keyMatches) {
          const qNum = parseInt(m[1], 10);
          const ansList = m[2].toUpperCase().split(/[\s,;]+/).filter(Boolean);
          answerKeyMap[qNum] = ansList;
        }
      } else {
        contentLines.push(lines[i]);
      }
    }

    // 2. Identify question boundaries
    const questionStartRegex = /^(?:(?:Câu|Bài|Question)\s*(\d+)[\s.:：\)\-–—]+|(\d+)[\.\)\:]\s+)(.*)$/i;
    const rawQuestions = [];
    let currentQ = null;

    for (let i = 0; i < contentLines.length; i++) {
      const rawLine = contentLines[i];
      const trimmed = rawLine.trim();

      const qMatch = trimmed.match(questionStartRegex);
      if (qMatch) {
        if (currentQ) {
          rawQuestions.push(currentQ);
        }
        const qNum = parseInt(qMatch[1] || qMatch[2], 10);
        const rest = qMatch[3] || '';
        currentQ = {
          qNum: qNum || (rawQuestions.length + 1),
          headerText: rest,
          bodyLines: []
        };
      } else {
        if (currentQ) {
          currentQ.bodyLines.push(rawLine);
        }
      }
    }

    if (currentQ) {
      rawQuestions.push(currentQ);
    }

    // Fallback: If no "Câu X" prefix found, but text exists, treat as 1 question or split by double newline
    if (rawQuestions.length === 0 && text.length > 0) {
      rawQuestions.push({
        qNum: 1,
        headerText: lines[0] || '',
        bodyLines: lines.slice(1)
      });
    }

    // 3. Parse each question
    const parsedQuestions = [];

    for (const rq of rawQuestions) {
      let questionText = rq.headerText;
      const allLines = [rq.headerText, ...rq.bodyLines];
      const fullBlock = allLines.join('\n');

      let difficulty = 'medium';
      let subject = defaultSubject;
      let explanation = '';
      const choices = [];
      const detectedAnswers = [];

      // Extract subject tag [Môn: ...] or [Chủ đề: ...]
      const subjectMatch = fullBlock.match(/\[(?:Môn|Chủ đề|Subject)[:\s]+([^\]]+)\]/i);
      if (subjectMatch) subject = subjectMatch[1].trim();

      // Extract difficulty tag
      if (/\[(?:Nhận biết|Dễ|Easy)\]/i.test(fullBlock) || /\[(?:Mức độ|Độ khó)[:\s]+(?:Nhận biết|Dễ|Easy)\]/i.test(fullBlock)) {
        difficulty = 'easy';
      } else if (/\[(?:Thông hiểu|Trung bình|Medium)\]/i.test(fullBlock) || /\[(?:Mức độ|Độ khó)[:\s]+(?:Thông hiểu|Trung bình|Medium)\]/i.test(fullBlock)) {
        difficulty = 'medium';
      } else if (/\[(?:Vận dụng(?: cao)?|Khó|Hard)\]/i.test(fullBlock) || /\[(?:Mức độ|Độ khó)[:\s]+(?:Vận dụng(?: cao)?|Khó|Hard)\]/i.test(fullBlock)) {
        difficulty = 'hard';
      }

      // Clean tags from question prompt
      questionText = questionText.replace(/\[(?:Môn|Chủ đề|Subject|Mức độ|Độ khó)[:\s]+[^\]]+\]/gi, '')
                                 .replace(/\[(?:Nhận biết|Thông hiểu|Vận dụng(?: cao)?|Dễ|Trung bình|Khó|Easy|Medium|Hard)\]/gi, '')
                                 .trim();

      const choiceRegex = /^(?:\*|\s*)?([A-H])(?:[\.\)\:\/]|[\s]+)(.*)$/i;
      const answerLineRegex = /^(?:Đáp\s*án(?:\s*đúng)?|Đ\/A|Key|Answer)[\s:：\-–—]+([A-H](?:[\s,;]+[A-H])*)/i;
      const explanationRegex = /^(?:Lời\s*giải|Giải\s*thích|Hướng\s*dẫn\s*giải|Explanation)[\s:：\-–—]+(.*)$/i;

      let inExplanation = false;
      const promptLines = [questionText];
      let inChoices = false;

      for (let j = 0; j < rq.bodyLines.length; j++) {
        const line = rq.bodyLines[j].trim();
        if (!line) continue;

        // Check explanation
        const expMatch = line.match(explanationRegex);
        if (expMatch) {
          inExplanation = true;
          explanation = expMatch[1] || '';
          continue;
        }

        if (inExplanation) {
          explanation += (explanation ? '\n' : '') + line;
          continue;
        }

        // Check inline answer line: "Đáp án: A"
        const ansMatch = line.match(answerLineRegex);
        if (ansMatch) {
          const ansLetters = ansMatch[1].toUpperCase().split(/[\s,;]+/).filter(Boolean);
          detectedAnswers.push(...ansLetters);
          continue;
        }

        // Check for multiple choices on a single line: "A. xxx   B. yyy   C. zzz   D. ttt"
        const multiChoiceOnLine = line.split(/(?=[A-H][\.\)\:\/]\s+)/i).map(s => s.trim()).filter(Boolean);
        if (multiChoiceOnLine.length >= 2 && multiChoiceOnLine.every(s => /^[A-H][\.\)\:\/]/i.test(s))) {
          inChoices = true;
          for (const mc of multiChoiceOnLine) {
            const match = mc.match(/^([A-H])[\.\)\:\/]\s*(.*)$/i);
            if (match) {
              const label = match[1].toUpperCase();
              let content = match[2].trim();
              let isCorrect = false;

              if (content.startsWith('*') || mc.startsWith('*') || content.endsWith('*')) {
                isCorrect = true;
                content = content.replace(/^\*\s*/, '').replace(/\s*\*$/, '').trim();
              }
              choices.push({ label, content, is_correct: isCorrect });
            }
          }
          continue;
        }

        // Check single choice line
        const chMatch = line.match(choiceRegex);
        if (chMatch) {
          inChoices = true;
          const label = chMatch[1].toUpperCase();
          let content = chMatch[2].trim();
          let isCorrect = false;

          if (line.trim().startsWith('*') || content.startsWith('*') || content.endsWith('*')) {
            isCorrect = true;
            content = content.replace(/^\*\s*/, '').replace(/\s*\*$/, '').trim();
          }

          choices.push({ label, content, is_correct: isCorrect });
        } else {
          if (!inChoices) {
            promptLines.push(line);
          } else {
            if (choices.length > 0) {
              choices[choices.length - 1].content += ' ' + line;
            }
          }
        }
      }

      // Cross-reference detected answers from answer line or answer table
      if (answerKeyMap[rq.qNum]) {
        detectedAnswers.push(...answerKeyMap[rq.qNum]);
      }

      if (detectedAnswers.length > 0) {
        choices.forEach(c => {
          if (detectedAnswers.includes(c.label)) {
            c.is_correct = true;
          }
        });
      }

      const fullPrompt = promptLines.filter(Boolean).join('\n').trim();
      let title = fullPrompt.split('\n')[0].trim();
      if (title.length > 80) title = title.substring(0, 77) + '...';
      if (!title) title = `Câu hỏi ${rq.qNum}`;

      const correctCount = choices.filter(c => c.is_correct).length;
      const question_type = correctCount > 1 ? 'multiple_choice' : 'single_choice';

      const isValid = choices.length >= 2 && correctCount >= 1;
      const errors = [];
      if (choices.length < 2) errors.push('Thiếu phương án (tối thiểu 2 phương án A, B,...)');
      if (correctCount === 0) errors.push('Chưa xác định đáp án đúng (Thêm dấu * hoặc Đáp án: X)');

      parsedQuestions.push({
        index: parsedQuestions.length + 1,
        title,
        content: fullPrompt || title,
        question_type,
        difficulty,
        subject,
        explanation,
        choices,
        isValid,
        errors
      });
    }

    return {
      success: true,
      questions: parsedQuestions,
      stats: {
        total: parsedQuestions.length,
        valid: parsedQuestions.filter(q => q.isValid).length,
        invalid: parsedQuestions.filter(q => !q.isValid).length
      }
    };
  }

  /**
   * Parse Word (.docx) file using mammoth.js
   */
  async function parseWordDocx(file, defaultSubject = 'Chung') {
    if (typeof mammoth === 'undefined') {
      throw new Error('Thư viện mammoth.js chưa được tải. Vui lòng kiểm tra lại kết nối script.');
    }

    const arrayBuffer = await file.arrayBuffer();

    // Convert to HTML to preserve underline/bold which teachers often use for correct answers
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    let html = htmlResult.value || '';

    // Convert <u>...</u> to *...* so our parser sees it as marked correct
    html = html.replace(/<u>([^<]+)<\/u>/gi, '*$1*');

    // Extract raw text
    const textResult = await mammoth.extractRawText({ arrayBuffer });
    let rawText = textResult.value || '';

    // If html contained underlines converted to *, integrate them or parse converted text
    if (html.includes('*')) {
      // Create text version from html by replacing tags
      const div = document.createElement('div');
      div.innerHTML = html;
      rawText = div.innerText || div.textContent || rawText;
    }

    return parseText(rawText, defaultSubject);
  }

  /**
   * Parse Excel (.xlsx, .xls, .csv) data via SheetJS (xlsx.js)
   */
  async function parseExcelFile(file, defaultSubject = 'Chung') {
    if (typeof XLSX === 'undefined') {
      throw new Error('Thư viện xlsx.js chưa được tải. Vui lòng kiểm tra lại kết nối script.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('File Excel không có trang tính nào.');
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    return parseExcelRows(rows, defaultSubject);
  }

  /**
   * Parse 2D row array from Excel
   */
  function parseExcelRows(rows, defaultSubject = 'Chung') {
    if (!rows || rows.length < 2) {
      return {
        success: false,
        error: 'File Excel không có dữ liệu hoặc thiếu dòng tiêu đề.',
        questions: [],
        stats: { total: 0, valid: 0, invalid: 0 }
      };
    }

    let headerIndex = -1;
    let headers = [];

    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const strRow = row.map(cell => String(cell || '').toLowerCase().trim());
      const hasQuestion = strRow.some(c => c.includes('câu hỏi') || c.includes('question') || c.includes('nội dung'));
      const hasChoice = strRow.some(c => c.includes('đáp án') || c.includes('lựa chọn') || c === 'a' || c === 'b');
      if (hasQuestion || hasChoice) {
        headerIndex = r;
        headers = strRow;
        break;
      }
    }

    if (headerIndex === -1) {
      headerIndex = 0;
      headers = rows[0].map(c => String(c || '').toLowerCase().trim());
    }

    let colQuestion = -1;
    let colTitle = -1;
    let colA = -1;
    let colB = -1;
    let colC = -1;
    let colD = -1;
    let colE = -1;
    let colCorrect = -1;
    let colDiff = -1;
    let colSubject = -1;
    let colExp = -1;

    headers.forEach((h, idx) => {
      if (h.includes('câu hỏi') || h.includes('nội dung') || h === 'question' || h === 'content') colQuestion = idx;
      else if (h.includes('tiêu đề') || h === 'title') colTitle = idx;
      else if (h === 'a' || h.includes('đáp án a') || h.includes('lựa chọn a') || h.includes('phương án a') || h === 'option a') colA = idx;
      else if (h === 'b' || h.includes('đáp án b') || h.includes('lựa chọn b') || h.includes('phương án b') || h === 'option b') colB = idx;
      else if (h === 'c' || h.includes('đáp án c') || h.includes('lựa chọn c') || h.includes('phương án c') || h === 'option c') colC = idx;
      else if (h === 'd' || h.includes('đáp án d') || h.includes('lựa chọn d') || h.includes('phương án d') || h === 'option d') colD = idx;
      else if (h === 'e' || h.includes('đáp án e') || h.includes('lựa chọn e') || h.includes('phương án e')) colE = idx;
      else if (h.includes('đáp án đúng') || h.includes('đáp án') || h === 'key' || h === 'correct' || h === 'answer') colCorrect = idx;
      else if (h.includes('độ khó') || h.includes('mức độ') || h.includes('difficulty')) colDiff = idx;
      else if (h.includes('môn') || h.includes('chủ đề') || h.includes('subject')) colSubject = idx;
      else if (h.includes('giải thích') || h.includes('lời giải') || h.includes('explanation')) colExp = idx;
    });

    if (colQuestion === -1 && rows[0].length >= 5) {
      if (/^\d+$/.test(String(rows[1][0] || '').trim())) {
        colQuestion = 1; colA = 2; colB = 3; colC = 4; colD = 5; colCorrect = 6;
      } else {
        colQuestion = 0; colA = 1; colB = 2; colC = 3; colD = 4; colCorrect = 5;
      }
    }

    const parsedQuestions = [];

    for (let r = headerIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawContent = colQuestion !== -1 && row[colQuestion] !== undefined ? String(row[colQuestion]).trim() : '';
      if (!rawContent) continue;

      let rawTitle = colTitle !== -1 && row[colTitle] !== undefined ? String(row[colTitle]).trim() : '';
      if (!rawTitle) {
        rawTitle = rawContent.split('\n')[0].trim();
        if (rawTitle.length > 80) rawTitle = rawTitle.substring(0, 77) + '...';
      }

      const choices = [];
      const choiceCols = [
        { label: 'A', col: colA },
        { label: 'B', col: colB },
        { label: 'C', col: colC },
        { label: 'D', col: colD },
        { label: 'E', col: colE }
      ];

      const correctRaw = colCorrect !== -1 && row[colCorrect] !== undefined ? String(row[colCorrect]).trim().toUpperCase() : '';
      const correctLetters = correctRaw.split(/[\s,;]+/).filter(Boolean);

      choiceCols.forEach(({ label, col }) => {
        if (col !== -1 && row[col] !== undefined) {
          let content = String(row[col]).trim();
          if (content) {
            let isCorrect = correctLetters.includes(label) || correctLetters.includes(content.toUpperCase());
            if (content.startsWith('*') || content.endsWith('*')) {
              isCorrect = true;
              content = content.replace(/^\*\s*/, '').replace(/\s*\*$/, '').trim();
            }
            choices.push({ label, content, is_correct: isCorrect });
          }
        }
      });

      let difficulty = 'medium';
      if (colDiff !== -1 && row[colDiff] !== undefined) {
        const diffRaw = String(row[colDiff]).toLowerCase().trim();
        if (diffRaw.includes('dễ') || diffRaw.includes('easy') || diffRaw.includes('nhận biết')) difficulty = 'easy';
        else if (diffRaw.includes('khó') || diffRaw.includes('hard') || diffRaw.includes('vận dụng')) difficulty = 'hard';
        else difficulty = 'medium';
      }

      let subject = defaultSubject;
      if (colSubject !== -1 && row[colSubject] !== undefined && String(row[colSubject]).trim()) {
        subject = String(row[colSubject]).trim();
      }

      let explanation = '';
      if (colExp !== -1 && row[colExp] !== undefined) {
        explanation = String(row[colExp]).trim();
      }

      const correctCount = choices.filter(c => c.is_correct).length;
      const question_type = correctCount > 1 ? 'multiple_choice' : 'single_choice';
      const isValid = choices.length >= 2 && correctCount >= 1;
      const errors = [];
      if (choices.length < 2) errors.push('Thiếu phương án (tối thiểu 2)');
      if (correctCount === 0) errors.push('Chưa xác định đáp án đúng');

      parsedQuestions.push({
        index: parsedQuestions.length + 1,
        title: rawTitle,
        content: rawContent,
        question_type,
        difficulty,
        subject,
        explanation,
        choices,
        isValid,
        errors
      });
    }

    return {
      success: true,
      questions: parsedQuestions,
      stats: {
        total: parsedQuestions.length,
        valid: parsedQuestions.filter(q => q.isValid).length,
        invalid: parsedQuestions.filter(q => !q.isValid).length
      }
    };
  }

  /**
   * Universal file parser (routes to Word, Excel, or Text)
   */
  async function parseFile(file, defaultSubject = 'Chung') {
    if (!file) throw new Error('Không có file nào được chọn');
    const name = file.name.toLowerCase();

    if (name.endsWith('.docx')) {
      return await parseWordDocx(file, defaultSubject);
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return await parseExcelFile(file, defaultSubject);
    } else if (name.endsWith('.txt')) {
      const text = await file.text();
      return parseText(text, defaultSubject);
    } else {
      throw new Error('Định dạng file không được hỗ trợ. Vui lòng tải file Word (.docx), Excel (.xlsx, .xls, .csv) hoặc Text (.txt).');
    }
  }

  /**
   * Helper to download sample Excel template
   */
  function downloadSampleExcel() {
    if (typeof XLSX === 'undefined') {
      alert('Thư viện tạo file Excel chưa tải xong. Vui lòng tải lại trang.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const data = [
      ['STT', 'Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng', 'Độ khó', 'Môn học', 'Giải thích'],
      [1, 'Giao thức nào hoạt động ở tầng Giao vận trong mô hình TCP/IP?', 'TCP và UDP', 'IP và ICMP', 'HTTP và FTP', 'ARP và RARP', 'A', 'Dễ', 'Mạng Máy Tính', 'TCP và UDP là 2 giao thức cốt lõi của tầng Giao vận'],
      [2, 'Thiết bị nào sau đây hoạt động ở tầng Mạng (Network Layer)?', 'Switch Layer 2', 'Hub', 'Router', 'Repeater', 'C', 'Trung bình', 'Mạng Máy Tính', 'Router định tuyến các gói tin IP ở Layer 3'],
      [3, 'Cổng mặc định của dịch vụ Secure Shell (SSH) là cổng nào?', '21', '22', '23', '25', 'B', 'Dễ', 'DevOps', 'SSH sử dụng cổng TCP 22 mặc định'],
      [4, 'Lệnh nào sau đây dùng để tạo một commit mới trong Git?', 'git push', 'git commit -m "msg"', 'git checkout', 'git init', 'B', 'Dễ', 'DevOps', 'git commit ghi lại thay đổi vào repository'],
      [5, 'Trong quan hệ CSDL, khóa chính (Primary Key) có đặc điểm gì?', 'Có thể chứa giá trị NULL', 'Duy nhất và không được NULL', 'Có thể trùng lặp', 'Chỉ chứa số nguyên', 'B', 'Trung bình', 'Cơ Sở Dữ Liệu', 'Khóa chính định danh duy nhất mỗi bản ghi']
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Cau_Hoi');
    XLSX.writeFile(wb, 'Mau_Cau_Hoi_QuizSystem.xlsx');
  }

  /**
   * Helper to download sample Word / Text template
   */
  function downloadSampleWord() {
    const content = `[Môn: Mạng Máy Tính]

Câu 1: [Nhận biết] Giao thức nào hoạt động ở tầng Giao vận trong mô hình TCP/IP?
*A. TCP và UDP
B. IP và ICMP
C. HTTP và FTP
D. ARP và RARP
Lời giải: TCP và UDP là 2 giao thức cốt lõi của tầng Giao vận (Transport Layer).

Câu 2: Thiết bị nào sau đây hoạt động ở tầng Mạng (Network Layer)?
A. Switch Layer 2
B. Hub
C. Router
D. Repeater
Đáp án: C

Câu 3: [Độ khó: Khó] Các giao thức nào sau đây sử dụng giao thức truyền vận TCP?
A. HTTP
B. DNS
C. FTP
D. TFTP
Đáp án: A, C

Câu 4: Cổng mặc định của dịch vụ Secure Shell (SSH) là gì?
A. 21
B. 22
C. 23
D. 25
Đáp án: B

BẢNG ĐÁP ÁN:
1.A  2.C  3.A,C  4.B
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mau_Cau_Hoi_Azota_QuizSystem.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    parseText,
    parseWordDocx,
    parseExcelFile,
    parseExcelRows,
    parseFile,
    downloadSampleExcel,
    downloadSampleWord
  };
});
