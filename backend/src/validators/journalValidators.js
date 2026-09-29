/**
 * Validates journal creation input. All fields are required.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: object }}
 */
export function validateJournalInput(body = {}) {
  const errors = [];
  const { title, abstract, content, domain } = body;

  if (typeof title !== "string" || !title.trim()) {
    errors.push("Title is required");
  } else if (title.trim().length < 3) {
    errors.push("Title must be at least 3 characters long");
  } else if (title.trim().length > 200) {
    errors.push("Title cannot exceed 200 characters");
  }

  if (typeof abstract !== "string" || !abstract.trim()) {
    errors.push("Abstract is required");
  } else if (abstract.trim().length > 2000) {
    errors.push("Abstract cannot exceed 2000 characters");
  }

  if (typeof content !== "string" || !content.trim()) {
    errors.push("Content is required");
  }

  if (typeof domain !== "string" || !domain.trim()) {
    errors.push("Domain is required");
  } else if (domain.trim().length > 100) {
    errors.push("Domain cannot exceed 100 characters");
  }

  return {
    errors,
    sanitized: {
      title: typeof title === "string" ? title.trim() : "",
      abstract: typeof abstract === "string" ? abstract.trim() : "",
      content: typeof content === "string" ? content.trim() : "",
      domain: typeof domain === "string" ? domain.trim() : "",
    },
  };
}

/**
 * Validates journal update input. Only fields present in the body are validated.
 * Missing fields are left unchanged on the document.
 * @param {object} body - Request body
 * @returns {{ errors: string[], sanitized: object }}
 */
export function validateUpdateInput(body = {}) {
  const errors = [];
  const sanitized = {};
  const { title, abstract, content, domain } = body;

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      errors.push("Title cannot be empty");
    } else if (title.trim().length < 3) {
      errors.push("Title must be at least 3 characters long");
    } else if (title.trim().length > 200) {
      errors.push("Title cannot exceed 200 characters");
    } else {
      sanitized.title = title.trim();
    }
  }

  if (abstract !== undefined) {
    if (typeof abstract !== "string" || !abstract.trim()) {
      errors.push("Abstract cannot be empty");
    } else if (abstract.trim().length > 2000) {
      errors.push("Abstract cannot exceed 2000 characters");
    } else {
      sanitized.abstract = abstract.trim();
    }
  }

  if (content !== undefined) {
    if (typeof content !== "string" || !content.trim()) {
      errors.push("Content cannot be empty");
    } else {
      sanitized.content = content.trim();
    }
  }

  if (domain !== undefined) {
    if (typeof domain !== "string" || !domain.trim()) {
      errors.push("Domain cannot be empty");
    } else if (domain.trim().length > 100) {
      errors.push("Domain cannot exceed 100 characters");
    } else {
      sanitized.domain = domain.trim();
    }
  }

  return { errors, sanitized };
}
